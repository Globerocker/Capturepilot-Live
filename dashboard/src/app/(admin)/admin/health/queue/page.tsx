import { redirect } from "next/navigation";

/**
 * /admin/health/queue → /admin/queue
 *
 * The category landing page for the "queue" health area is the same as the
 * main worker queue dashboard. Detail pages live at
 * /admin/health/queue/[task_type] for parity with the rest of the
 * /admin/health/* tree (storage, database, integrations, crons).
 */
export default function QueueHealthIndex() {
    redirect("/admin/queue");
}
