import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GrievanceSchema = z.object({
  complainant_name: z.string().trim().min(2).max(120),
  complainant_email: z.string().trim().email().max(255),
  complainant_phone: z.string().trim().max(20).optional().nullable(),
  category: z.string().trim().min(2).max(80),
  subject: z.string().trim().min(3).max(200),
  description: z.string().trim().min(10).max(4000),
  against_analyst_id: z.string().uuid().optional().nullable(),
  user_id: z.string().uuid().optional().nullable(),
});

export const submitGrievance = createServerFn({ method: "POST" })
  .inputValidator((input) => GrievanceSchema.parse(input))
  .handler(async ({ data }) => {
    const { data: row, error } = await supabaseAdmin
      .from("grievances")
      .insert({
        complainant_name: data.complainant_name,
        complainant_email: data.complainant_email,
        complainant_phone: data.complainant_phone ?? null,
        category: data.category,
        subject: data.subject,
        description: data.description,
        against_analyst_id: data.against_analyst_id ?? null,
        user_id: data.user_id ?? null,
      })
      .select("ticket_number, sla_due_at")
      .single();

    if (error) {
      console.error("submitGrievance failed", error);
      return { success: false as const, error: "Could not file your grievance. Please try again." };
    }

    return {
      success: true as const,
      ticket_number: row.ticket_number,
      sla_due_at: row.sla_due_at,
    };
  });

export const getAnalystComplaintsSummary = createServerFn({ method: "GET" })
  .inputValidator((input: { analyst_id: string }) =>
    z.object({ analyst_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { data: row, error } = await supabaseAdmin
      .from("analyst_complaints_summary")
      .select("*")
      .eq("analyst_id", data.analyst_id)
      .maybeSingle();

    if (error) {
      console.error("getAnalystComplaintsSummary failed", error);
    }

    return {
      total_last_30d: Number(row?.total_last_30d ?? 0),
      resolved_last_30d: Number(row?.resolved_last_30d ?? 0),
      pending_last_30d: Number(row?.pending_last_30d ?? 0),
      total_all_time: Number(row?.total_all_time ?? 0),
      resolved_all_time: Number(row?.resolved_all_time ?? 0),
    };
  });
