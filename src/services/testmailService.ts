import axios, { AxiosResponse } from 'axios';
import { EmailResponse, MailboxProvider, TestmailOptions } from '../types';
import MailboxService from './mailboxService';

interface TestmailEmail {
    id: string;
    tag: string;
    timestamp: number;
    from: string;
    subject: string;
    html?: string;
    text?: string;
}

interface TestmailResponse {
    result: 'success' | 'fail';
    message: string | null;
    emails: TestmailEmail[];
}

/**
 * testmail.app (https://testmail.app) receives mail for {namespace}.{tag}@inbox.testmail.app, where
 * the namespace belongs to the account and any tag works without creating it first.
 * Requires an API key and namespace (free plan available).
 */
class TestmailService extends MailboxService {

    API_URL = 'https://api.testmail.app/api/json';
    PROVIDER: MailboxProvider = 'TESTMAIL';
    EMAIL_DOMAIN = 'inbox.testmail.app';
    /** The API returns at most 100 emails per request. */
    MAX_EMAILS = 100;

    private readonly apiKey: string;
    private readonly namespace: string;
    private tag = '';
    /** The API has no fetch by ID, the list already contains the full emails. */
    private fetchedEmails = new Map<string, EmailResponse>();

    constructor(options: TestmailOptions = {}) {
        super();
        this.apiKey = options.apiKey || process.env.TESTMAIL_API_KEY || '';
        this.namespace = (options.namespace || process.env.TESTMAIL_NAMESPACE || '').toLowerCase();
    }

    private assertConfigured(): void {
        if (!this.apiKey || !this.namespace) {
            throw new Error('testmail.app requires an API key and namespace, pass them as options or set '
                + 'TESTMAIL_API_KEY and TESTMAIL_NAMESPACE.');
        }
    }

    private async sendRequest(params: Record<string, string | number>, isRetry = 0): Promise<AxiosResponse<TestmailResponse> | undefined> {
        this.assertConfigured();
        try {
            return await axios.get<TestmailResponse>(this.API_URL, {
                params: { apikey: this.apiKey, namespace: this.namespace, ...params },
            });
        } catch (error: unknown) {
            if (axios.isAxiosError(error) && error.response?.status === 429 && isRetry < 3) {
                await this.sleep(2000);
                return this.sendRequest(params, isRetry + 1);
            }
            return;
        }
    }

    private static toEmailResponse(email: TestmailEmail): EmailResponse {
        return {
            mail_id: email.id,
            mail_from: email.from || '',
            mail_timestamp: email.timestamp,
            mail_subject: email.subject || '',
            mail_excerpt: '',
            mail_body: email.html || email.text || '',
        };
    }

    /**
     * Generate an address with a random tag in the configured namespace.
     * @returns email address
     */
    async createEmailAddress(): Promise<string> {
        this.assertConfigured();
        this.tag = Math.random().toString(36).substring(2, 12);
        this.fetchedEmails.clear();
        return `${this.namespace}.${this.tag}@${this.EMAIL_DOMAIN}`;
    }

    /**
     * Use the given address, either a full {namespace}.{tag}@inbox.testmail.app address or just a tag.
     * @param emailAddress
     * @returns True, or false if the address doesn't belong to the configured namespace.
     */
    async setEmailAddress(emailAddress: string): Promise<boolean> {
        this.assertConfigured();
        const address = emailAddress.toLowerCase();
        let tag = address;
        if (address.includes('@')) {
            const [localPart, domain] = address.split('@');
            const prefix = `${this.namespace}.`;
            if (domain !== this.EMAIL_DOMAIN || !localPart.startsWith(prefix)) return false;
            tag = localPart.substring(prefix.length);
        }
        if (!tag) return false;
        this.tag = tag;
        this.fetchedEmails.clear();
        return true;
    }

    /**
     * Get the newest 100 emails, newest first. The body is included.
     * @returns Array of emails
     */
    async fetchEmailList(): Promise<EmailResponse[]> {
        const response = await this.sendRequest({ tag: this.tag, limit: this.MAX_EMAILS });
        if (response?.data?.result !== 'success') return [];
        const emails = response.data.emails.map(email => TestmailService.toEmailResponse(email));
        emails.forEach(email => this.fetchedEmails.set(email.mail_id, email));
        return emails.sort((a, b) => b.mail_timestamp - a.mail_timestamp);
    }

    /**
     * Forget the current email address by clearing the local state. testmail.app has no API
     * to delete mails, they expire with the retention period of the plan.
     * @param emailAddress
     * @returns True
     */
    async forgetEmailAddress(_emailAddress: string): Promise<boolean> {
        this.tag = '';
        this.fetchedEmails.clear();
        return true;
    }

    /**
     * testmail.app has no API to delete emails. Use the receivedAfter argument of waitForEmail()
     * or a fresh tag to ignore older mails.
     * @returns false
     */
    async deleteEmailById(_emailId: string): Promise<boolean> {
        return false;
    }

    /**
     * Get an email by ID. The API can't fetch by ID, so this looks it up in the current list.
     * @param emailId
     * @returns EmailResponse on success, undefined if not found
     */
    async fetchEmailById(emailId: string): Promise<EmailResponse | undefined> {
        if (!this.fetchedEmails.has(emailId)) {
            await this.fetchEmailList();
        }
        return this.fetchedEmails.get(emailId);
    }

    sendSelfMail(_subject: string, _body: string): Promise<boolean> {
        throw new Error('Method not implemented for the testmail.app provider.');
    }
}

export default TestmailService;
