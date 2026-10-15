// Queue names and job payloads shared by web (producer) and worker (consumer).
// Kept free of env/connection code so both processes can import it.

export const EMAIL_QUEUE = "email";

// Emails are rendered by the producer, so the worker only delivers them.
export type EmailJob = {
  to: string;
  subject: string;
  text: string;
};
