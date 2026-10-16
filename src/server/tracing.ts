import { context, propagation, SpanStatusCode, trace, type Attributes, type Span } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchSpanProcessor, NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

// OpenTelemetry traces, shared by web and worker (env-free, like jobs.ts).
//
// Off unless OTEL_EXPORTER_OTLP_ENDPOINT is set (compose profile
// "observability" runs Jaeger to receive them). Next.js creates the request
// spans itself once a tracer provider is registered; we add spans around the
// work that matters and carry the trace through the job queue, so one trace
// shows the upload's "complete" request in web and the processing in worker.

export function startTracing(serviceName: string): NodeTracerProvider | null {
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) return null;
  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: serviceName }),
    // Batched: spans are sent in the background, not on the request's path.
    spanProcessors: [new BatchSpanProcessor(new OTLPTraceExporter())],
  });
  // Global provider + W3C trace-context propagation + async context tracking.
  provider.register();
  return provider;
}

const tracer = () => trace.getTracer("media-review-hub");

// Runs `work` in a child span of the current one. Without a registered
// provider these are no-ops, so the code reads the same either way.
export function inSpan<T>(name: string, attributes: Attributes, work: (span: Span) => Promise<T>): Promise<T> {
  return tracer().startActiveSpan(name, { attributes }, async (span) => {
    try {
      return await work(span);
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw error;
    } finally {
      span.end();
    }
  });
}

// The current trace as plain strings (a W3C "traceparent"), to put into a
// job's data; the worker continues the trace from it.
export type TraceCarrier = Record<string, string>;

export function traceCarrier(): TraceCarrier {
  const carrier: TraceCarrier = {};
  propagation.inject(context.active(), carrier);
  return carrier;
}

export function withTraceFrom<T>(carrier: TraceCarrier | undefined, work: () => T): T {
  return context.with(carrier ? propagation.extract(context.active(), carrier) : context.active(), work);
}
