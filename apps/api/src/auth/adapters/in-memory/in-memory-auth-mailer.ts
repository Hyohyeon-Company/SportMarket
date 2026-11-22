import type { AuthMailer, MailMessage } from "../../ports/auth-ports";

/**
 * Records outgoing mail instead of sending it.
 *
 * This card must not contact a real mail transport, and a test needs to prove that
 * a reset/verification mail was produced — including the token the user would have
 * received, which is the only way to exercise the confirm step end to end.
 */
export class InMemoryAuthMailer implements AuthMailer {
  private readonly sent: MailMessage[] = [];

  async send(message: MailMessage): Promise<void> {
    this.sent.push({ ...message });
  }

  /** Delivered messages, oldest first. */
  messages(): MailMessage[] {
    return this.sent.map((message) => ({ ...message }));
  }

  lastMessage(): MailMessage | null {
    const last = this.sent[this.sent.length - 1];
    return last === undefined ? null : { ...last };
  }

  /** The last token mailed to `address`, or null when nothing was sent to it. */
  lastTokenFor(address: string): string | null {
    for (let index = this.sent.length - 1; index >= 0; index -= 1) {
      const message = this.sent[index];
      if (message === undefined || message.to !== address) {
        continue;
      }
      const token = /token=([^\s&]+)/.exec(message.text);
      if (token !== null && token[1] !== undefined) {
        return token[1];
      }
    }
    return null;
  }
}
