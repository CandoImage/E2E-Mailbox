import axios, { AxiosError, AxiosResponse } from 'axios';
import { EmailResponse, MailboxProvider } from '../types';
import MailboxService from './mailboxService';

interface MailDropMessage {
    id: string;
    subject: string;
    headerfrom: string;
    date: string;
}

interface MailDropFullMessage extends MailDropMessage {
    html: string;
}

interface MailDropInboxResponse {
    data: {
        inbox: MailDropMessage[];
    };
}

interface MailDropMessageResponse {
    data: {
        message: MailDropFullMessage | null;
    };
}

interface MailDropDeleteResponse {
    data: {
        delete: boolean;
    };
}

class MailDropService extends MailboxService {

    API_URL = 'https://api.maildrop.cc/graphql';
    PROVIDER: MailboxProvider = 'MAILDROP';
    private mailboxName = '';

    /**
     * Send a GraphQL request to the MailDrop API.
     * Automatically retries up to 3 times on 429 (rate limit) responses,
     * waiting 10 seconds between attempts to respect the rate limit window.
     * @param query - GraphQL query or mutation string
     * @param variables - GraphQL variables
     * @param isRetry - current retry count
     * @returns AxiosResponse on success, undefined on failure.
     */
    private async sendRequest<T>(query: string, variables: Record<string, string> = {}, isRetry = 0): Promise<AxiosResponse<T> | undefined> {
        try {
            return await axios.post<T>(this.API_URL, { query, variables }, {
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (error: AxiosError | unknown) {
            if (axios.isAxiosError(error)) {
                // Automatically retry up to 3 times on 429 rate limit responses.
                // Wait 10 seconds to allow the rate limit window to reset.
                if (error.response?.status === 429 && isRetry < 3) {
                    await this.sleep(10000);
                    return this.sendRequest(query, variables, isRetry + 1);
                }
            }
            return;
        }
    }

    /**
     * Convert a MailDrop message to the shared EmailResponse format.
     * @param msg - MailDrop message object
     * @param body - Optional HTML body content
     * @returns EmailResponse
     */
    private static toEmailResponse(msg: MailDropMessage, body = ''): EmailResponse {
        return {
            mail_id: msg.id,
            mail_from: msg.headerfrom,
            mail_timestamp: new Date(msg.date).getTime(),
            mail_subject: msg.subject,
            mail_excerpt: '',
            mail_body: body,
        };
    }

    /**
     * Initialize a mailbox session by generating a random mailbox name.
     * MailDrop does not require account creation — any mailbox name is valid.
     * @returns email address in the format <mailboxname>@maildrop.cc
     */
    async createEmailAddress(): Promise<string> {
        this.mailboxName = Math.random().toString(36).substring(2, 12);
        const EMAIL_DOMAIN = 'maildrop.cc';
        return `${this.mailboxName}@${EMAIL_DOMAIN}`;
    }

    async setEmailAddress(emailAddress: string): Promise<boolean> {
      this.mailboxName = emailAddress.split('@')[0];
      return true;
    }

    /**
     * Get the current list of emails from the MailDrop inbox.
     * @returns Array of emails
     */
    async fetchEmailList(): Promise<EmailResponse[]> {
        const query = `
            query Inbox($mailbox: String!) {
                inbox(mailbox: $mailbox) {
                    id
                    subject
                    headerfrom
                    date
                }
            }
        `;
        const response = await this.sendRequest<MailDropInboxResponse>(query, { mailbox: this.mailboxName });
        if (!response) { return []; }
        const messages = response.data?.data?.inbox ?? [];
        return messages.map(msg => MailDropService.toEmailResponse(msg));
    }

    /**
     * Forget the current email address by clearing the local mailbox state.
     * MailDrop does not require server-side session management.
     * @param emailAddress
     * @returns True on success
     */
    async forgetEmailAddress(_emailAddress: string): Promise<boolean> {
        this.mailboxName = '';
        return true;
    }

    /**
     * Delete a specific email by ID from the MailDrop mailbox.
     * @param emailId
     * @returns true on success, false on failure
     */
    async deleteEmailById(emailId: string): Promise<boolean | undefined> {
        const mutation = `
            mutation Delete($mailbox: String!, $id: String!) {
                delete(mailbox: $mailbox, id: $id)
            }
        `;
        const response = await this.sendRequest<MailDropDeleteResponse>(
            mutation, { mailbox: this.mailboxName, id: emailId }
        );
        if (!response) { return; }
        return !!response.data?.data?.delete;
    }

    /**
     * Get the full contents of an email by ID from the MailDrop mailbox.
     * @param emailId
     * @returns EmailResponse on success, undefined if not found
     */
    async fetchEmailById(emailId: string): Promise<EmailResponse | undefined> {
        const query = `
            query Message($mailbox: String!, $id: String!) {
                message(mailbox: $mailbox, id: $id) {
                    id
                    subject
                    headerfrom
                    date
                    html
                    data
                }
            }
        `;
        const response = await this.sendRequest<MailDropMessageResponse>(
            query, { mailbox: this.mailboxName, id: emailId }
        );
        if (!response?.data?.data?.message) { return; }
        const msg = response.data.data.message;
        return MailDropService.toEmailResponse(msg, msg.html);
    }

    sendSelfMail(_subject: string, _body: string): Promise<boolean> {
        throw new Error('Method not implemented for the MailDrop provider.');
    }
}

export default MailDropService;
