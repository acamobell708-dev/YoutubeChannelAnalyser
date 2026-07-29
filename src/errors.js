export class AppError extends Error {
  constructor(message, { status = 500, code = "INTERNAL_ERROR", cause } = {}) {
    super(message, { cause });
    this.name = "AppError";
    this.status = status;
    this.code = code;
  }
}

export function toPublicError(error) {
  if (error instanceof AppError) {
    return {
      status: error.status,
      body: {
        error: {
          code: error.code,
          message: error.message,
        },
      },
    };
  }

  console.error(error);
  return {
    status: 500,
    body: {
      error: {
        code: "INTERNAL_ERROR",
        message: "The analysis could not be completed. Please try again.",
      },
    },
  };
}
