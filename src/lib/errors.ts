export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

type ErrorLike = Error & {
  status?: number;
  statusCode?: number;
  responseBody?: string;
};

export function toErrorPayload(error: unknown) {
  if (error instanceof AppError) {
    return { status: error.status, message: error.message, details: error.details };
  }

  if (error instanceof Error) {
    const errorLike = error as ErrorLike;
    const status =
      typeof errorLike.status === "number"
        ? errorLike.status
        : typeof errorLike.statusCode === "number"
          ? errorLike.statusCode
          : 500;

    return {
      status,
      message: error.message,
      details: errorLike.responseBody,
    };
  }

  return {
    status: 500,
    message: "Unexpected server error",
    details: typeof error === "string" ? error : undefined,
  };
}

export function toJsonErrorResponse(error: unknown) {
  const payload = toErrorPayload(error);
  return Response.json(
    {
      error: payload.message,
      details: payload.details,
    },
    { status: payload.status },
  );
}

export function toTextErrorResponse(error: unknown) {
  const payload = toErrorPayload(error);
  const body = payload.details
    ? `${payload.status} ${payload.message}\n${payload.details}`
    : `${payload.status} ${payload.message}`;

  return new Response(body, {
    status: payload.status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
