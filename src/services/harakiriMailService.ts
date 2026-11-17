import axios, { AxiosResponse } from 'axios';
import { EmailResponse, MailboxProvider } from '../types';
import MailboxService from './mailboxService';

interface HarakiriMessage {
    _id: string;
    received: string;
    subject: string;
    from: string;
}

interface HarakiriInboxResponse {
    emails: HarakiriMessage[];
}

interface HarakiriFullMessage extends HarakiriMessage {
    bodytext: string;
}

/**
 * Harakiri Mail (https://harakirimail.com) receives mail for any @harakirimail.com address without
 * creating it first. Inboxes are public: anyone knowing an address can read its mails.
 */
class HarakiriMailService extends MailboxService {

    API_URL = 'https://harakirimail.com/api/v1';
    PROVIDER: MailboxProvider = 'HARAKIRI';
    EMAIL_DOMAIN = 'harakirimail.com';
    /** The API returns at most 50 emails per request. */
    MAX_EMAILS = 50;

    private mailboxName = '';

    private async sendRequest<T>(path: string, isRetry = 0): Promise<AxiosResponse<T> | undefined> {
        try {
            return await axios.get<T>(`${this.API_URL}${path}`);
        } catch (error: unknown) {
            if (axios.isAxiosError(error) && error.response?.status === 429 && isRetry < 3) {
                await this.sleep(2000);
                return this.sendRequest(path, isRetry + 1);
            }
            return;
        }
    }

    private static toEmailResponse(msg: HarakiriMessage, body = ''): EmailResponse {
        return {
            mail_id: msg._id,
            mail_from: msg.from,
            mail_timestamp: new Date(msg.received).getTime(),
            mail_subject: msg.subject || '',
            mail_excerpt: '',
            mail_body: body,
        };
    }

    /**
     * Generate a random @harakirimail.com address.
     * @returns email address
     */
    async createEmailAddress(): Promise<string> {
        this.mailboxName = Math.random().toString(36).substring(2, 12);
        return `${this.mailboxName}@${this.EMAIL_DOMAIN}`;
    }

    /**
     * Use the given address, only the local part names the inbox.
     * @param emailAddress
     * @returns True
     */
    async setEmailAddress(emailAddress: string): Promise<boolean> {
        this.mailboxName = emailAddress.split('@')[0].toLowerCase();
        return true;
    }

    /**
     * Get the newest 50 emails, newest first. The body is not included, use fetchEmailById() for that.
     * @returns Array of emails
     */
    async fetchEmailList(): Promise<EmailResponse[]> {
        const response = await this.sendRequest<HarakiriInboxResponse>(
            `/inbox/${encodeURIComponent(this.mailboxName)}?limit=${this.MAX_EMAILS}`,
        );
        const messages = response?.data?.emails ?? [];
        return messages
            .map(msg => HarakiriMailService.toEmailResponse(msg))
            .sort((a, b) => b.mail_timestamp - a.mail_timestamp);
    }

    /**
     * Forget the current email address by clearing the local state. Mails stay in the
     * public inbox until Harakiri Mail expires them.
     * @param emailAddress
     * @returns True
     */
    async forgetEmailAddress(_emailAddress: string): Promise<boolean> {
        this.mailboxName = '';
        return true;
    }

    /**
     * Harakiri Mail has no API to delete emails.
     * @returns false
     */
    async deleteEmailById(_emailId: string): Promise<boolean> {
        return false;
    }

    async fetchEmailById(emailId: string): Promise<EmailResponse | undefined> {
        const response = await this.sendRequest<HarakiriFullMessage>(`/email/${encodeURIComponent(emailId)}`);
        const msg = response?.data;
        if (!msg?._id) return;
        return HarakiriMailService.toEmailResponse(msg, msg.bodytext || '');
    }

    sendSelfMail(_subject: string, _body: string): Promise<boolean> {
        throw new Error('Method not implemented for the Harakiri Mail provider.');
    }
}

export default HarakiriMailService;
