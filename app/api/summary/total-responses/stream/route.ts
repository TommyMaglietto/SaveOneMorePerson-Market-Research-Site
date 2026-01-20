import { RESPONSE_EVENT, responseEvents } from "@/lib/response-events";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const KEEPALIVE_INTERVAL_MS = 15000;

type TotalResponsesPayload = {
  total: number;
};

export async function GET() {
  const supabase = getSupabaseAdmin();
  const encoder = new TextEncoder();
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let totalCount: number | null = null;
  let pendingDelta = 0;
  let handleUpdate: ((payload: { total?: number; delta?: number }) => void) | null =
    null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (payload: TotalResponsesPayload) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
        );
      };

      const sendKeepAlive = () => {
        controller.enqueue(encoder.encode(":keepalive\n\n"));
      };

      handleUpdate = (payload: { total?: number; delta?: number }) => {
        if (typeof payload.total === "number") {
          totalCount = payload.total;
          pendingDelta = 0;
          send({ total: totalCount });
          return;
        }
        if (payload.delta) {
          if (totalCount === null) {
            pendingDelta += payload.delta;
            return;
          }
          totalCount += payload.delta;
          send({ total: totalCount });
        }
      };

      responseEvents.on(RESPONSE_EVENT, handleUpdate);

      const loadInitialCount = async () => {
        const { count, error } = await supabase
          .from("Opinions")
          .select("id", { count: "exact", head: true });
        if (totalCount !== null) {
          return;
        }
        totalCount = error ? 0 : count ?? 0;
        if (pendingDelta) {
          totalCount += pendingDelta;
          pendingDelta = 0;
        }
        send({ total: totalCount });
      };

      void loadInitialCount();
      intervalId = setInterval(sendKeepAlive, KEEPALIVE_INTERVAL_MS);

    },
    cancel() {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      if (handleUpdate) {
        responseEvents.off(RESPONSE_EVENT, handleUpdate);
        handleUpdate = null;
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
