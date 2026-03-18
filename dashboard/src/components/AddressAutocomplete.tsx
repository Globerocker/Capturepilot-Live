"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { MapPin, Loader2 } from "lucide-react";

interface AddressResult {
    display_name: string;
    address: {
        house_number?: string;
        road?: string;
        city?: string;
        town?: string;
        village?: string;
        state?: string;
        postcode?: string;
        country_code?: string;
    };
}

interface AddressAutocompleteProps {
    value: string;
    onChange: (value: string) => void;
    onSelect: (address: {
        address_line_1: string;
        city: string;
        state: string;
        zip_code: string;
    }) => void;
    placeholder?: string;
    className?: string;
}

// US state abbreviation mapping
const STATE_NAMES: Record<string, string> = {
    "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR", "California": "CA",
    "Colorado": "CO", "Connecticut": "CT", "Delaware": "DE", "Florida": "FL", "Georgia": "GA",
    "Hawaii": "HI", "Idaho": "ID", "Illinois": "IL", "Indiana": "IN", "Iowa": "IA",
    "Kansas": "KS", "Kentucky": "KY", "Louisiana": "LA", "Maine": "ME", "Maryland": "MD",
    "Massachusetts": "MA", "Michigan": "MI", "Minnesota": "MN", "Mississippi": "MS", "Missouri": "MO",
    "Montana": "MT", "Nebraska": "NE", "Nevada": "NV", "New Hampshire": "NH", "New Jersey": "NJ",
    "New Mexico": "NM", "New York": "NY", "North Carolina": "NC", "North Dakota": "ND", "Ohio": "OH",
    "Oklahoma": "OK", "Oregon": "OR", "Pennsylvania": "PA", "Rhode Island": "RI", "South Carolina": "SC",
    "South Dakota": "SD", "Tennessee": "TN", "Texas": "TX", "Utah": "UT", "Vermont": "VT",
    "Virginia": "VA", "Washington": "WA", "West Virginia": "WV", "Wisconsin": "WI", "Wyoming": "WY",
    "District of Columbia": "DC",
};

export default function AddressAutocomplete({ value, onChange, onSelect, placeholder, className }: AddressAutocompleteProps) {
    const [results, setResults] = useState<AddressResult[]>([]);
    const [showResults, setShowResults] = useState(false);
    const [searching, setSearching] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
                setShowResults(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const search = useCallback(async (query: string) => {
        if (query.length < 4) {
            setResults([]);
            setShowResults(false);
            return;
        }

        setSearching(true);
        try {
            const res = await fetch(
                `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5&countrycodes=us`,
                { headers: { "Accept": "application/json" } }
            );
            const data = await res.json();
            setResults(data || []);
            setShowResults(data.length > 0);
        } catch {
            setResults([]);
        }
        setSearching(false);
    }, []);

    const handleInput = (val: string) => {
        onChange(val);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => search(val), 400);
    };

    const handleSelect = (result: AddressResult) => {
        const addr = result.address;
        const streetParts = [addr.house_number, addr.road].filter(Boolean);
        const street = streetParts.join(" ") || "";
        const city = addr.city || addr.town || addr.village || "";
        const stateFull = addr.state || "";
        const stateCode = STATE_NAMES[stateFull] || stateFull;
        const zip = addr.postcode || "";

        onChange(street);
        onSelect({
            address_line_1: street,
            city,
            state: stateCode,
            zip_code: zip,
        });
        setShowResults(false);
    };

    return (
        <div ref={wrapperRef} className="relative">
            <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                <input
                    type="text"
                    value={value}
                    onChange={(e) => handleInput(e.target.value)}
                    onFocus={() => results.length > 0 && setShowResults(true)}
                    placeholder={placeholder || "Start typing an address..."}
                    className={className || "w-full pl-9 pr-4 py-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none text-sm"}
                />
                {searching && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 animate-spin" />
                )}
            </div>

            {showResults && results.length > 0 && (
                <div className="absolute z-50 top-full mt-1 w-full bg-white rounded-xl border border-stone-200 shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                    {results.map((r, i) => (
                        <button
                            key={i}
                            type="button"
                            onClick={() => handleSelect(r)}
                            className="w-full text-left px-4 py-2.5 text-sm text-stone-700 hover:bg-stone-50 border-b border-stone-100 last:border-b-0 transition-colors"
                        >
                            <div className="flex items-start gap-2">
                                <MapPin className="w-3.5 h-3.5 text-stone-400 flex-shrink-0 mt-0.5" />
                                <span className="text-xs leading-snug">{r.display_name}</span>
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
