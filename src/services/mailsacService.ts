import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { EmailResponse, MailboxProvider, MailsacOptions } from '../types';
import MailboxService from './mailboxService';

interface MailsacAddress {
    address: string;
    name?: string;
}

interface MailsacMessage {
    _id: string;
    from: MailsacAddress[];
    subject: string;
    received: string;
}

class MailsacService extends MailboxService {

    API_URL = 'https://mailsac.com/api';
    PROVIDER: MailboxProvider = 'MAILSAC';
    EMAIL_DOMAIN = 'mailsac.com';

    private address = '';
    private readonly apiKey: string;

    constructor(options: MailsacOptions = {}) {
        super();
        this.apiKey = options.apiKey || process.env.MAILSAC_API_KEY || '';
    }

    /**
     * Send a request to the Mailsac API. Retries up to 3 times on 429 responses.
     * @returns AxiosResponse on success, undefined on failure.
     */
    private async sendRequest<T>(config: AxiosRequestConfig, isRetry = 0): Promise<AxiosResponse<T> | undefined> {
        if (!this.apiKey) throw new Error('Mailsac requires an API key, pass it as option or set MAILSAC_API_KEY.');
        try {
            return await axios.request<T>({
                ...config,
                baseURL: this.API_URL,
                headers: { 'Mailsac-Key': this.apiKey, ...config.headers },
            });
        } catch (error: unknown) {
            if (axios.isAxiosError(error) && error.response?.status === 429 && isRetry < 3) {
                await this.sleep(2000);
                return this.sendRequest(config, isRetry + 1);
            }
            return;
        }
    }

    private get encodedAddress(): string {
        return encodeURIComponent(this.address);
    }

    private static toEmailResponse(msg: MailsacMessage, body = ''): EmailResponse {
        const sender = msg.from?.[0];
        return {
            mail_id: msg._id,
            mail_from: sender ? (sender.name ? `${sender.name} <${sender.address}>` : sender.address) : '',
            mail_timestamp: new Date(msg.received).getTime(),
            mail_subject: msg.subject || '',
            mail_excerpt: '',
            mail_body: body,
        };
    }

    /**
     * Generate a random @mailsac.com address. Every address receives mail without being created first.
     * @returns email address
     */
    async createEmailAddress(): Promise<string> {
        if (!this.apiKey) throw new Error('Mailsac requires an API key, pass it as option or set MAILSAC_API_KEY.');
        this.address = `${Math.random().toString(36).substring(2, 12)}@${this.EMAIL_DOMAIN}`;
        return this.address;
    }

    /**
     * Use the given address. A local part only is completed with @mailsac.com, a full address
     * is kept as is, so custom domains of a Mailsac account work as well.
     * @param emailAddress
     * @returns True
     */
    async setEmailAddress(emailAddress: string): Promise<boolean> {
        this.address = (emailAddress.includes('@') ? emailAddress : `${emailAddress}@${this.EMAIL_DOMAIN}`).toLowerCase();
        return true;
    }

    /**
     * Get the current list of emails, newest first. The body is not included, use fetchEmailById() for that.
     * @returns Array of emails
     */
    async fetchEmailList(): Promise<EmailResponse[]> {
        const response = await this.sendRequest<MailsacMessage[]>({
            method: 'GET', url: `/addresses/${this.encodedAddress}/messages`,
        });
        const messages = response?.data ?? [];
        return messages
            .map(msg => MailsacService.toEmailResponse(msg))
            .sort((a, b) => b.mail_timestamp - a.mail_timestamp);
    }

    /**
     * Forget the current email address by clearing the local state. Messages stay in the
     * public inbox until Mailsac purges them.
     * @param emailAddress
     * @returns True on success
     */
    async forgetEmailAddress(_emailAddress: string): Promise<boolean> {
        this.address = '';
        return true;
    }

    async deleteEmailById(emailId: string): Promise<boolean> {
        const response = await this.sendRequest({
            method: 'DELETE', url: `/addresses/${this.encodedAddress}/messages/${encodeURIComponent(emailId)}`,
        });
        return response?.status === 200;
    }

    /**
     * Get the full contents of an email. The body is the unsanitized HTML, so links can be
     * extracted, falling back to the plain text body.
     * @param emailId
     * @returns EmailResponse on success, undefined if not found
     */
    async fetchEmailById(emailId: string): Promise<EmailResponse | undefined> {
        const id = encodeURIComponent(emailId);
        const response = await this.sendRequest<MailsacMessage>({
            method: 'GET', url: `/addresses/${this.encodedAddress}/messages/${id}`,
        });
        if (!response?.data?._id) return;
        const bodyConfig: AxiosRequestConfig = { method: 'GET', responseType: 'text', transformResponse: data => data };
        const html = await this.sendRequest<string>({ ...bodyConfig, url: `/dirty/${this.encodedAddress}/${id}` });
        let body = html?.data || '';
        if (!body) {
            const text = await this.sendRequest<string>({ ...bodyConfig, url: `/text/${this.encodedAddress}/${id}` });
            body = text?.data || '';
        }
        return MailsacService.toEmailResponse(response.data, body);
    }

    sendSelfMail(_subject: string, _body: string): Promise<boolean> {
        throw new Error('Method not implemented for the Mailsac provider.');
    }
}

export default MailsacService;
