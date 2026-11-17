import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import * as nodemailer from 'nodemailer';
import { EmailResponse, MailboxProvider, MailpitOptions, SmtpConfig } from '../types';
import MailboxService from './mailboxService';
import { resolveSelfHostedOptions } from './selfHostedOptions';

interface MailpitAddress {
    Name: string;
    Address: string;
}

interface MailpitMessage {
    ID: string;
    From: MailpitAddress | null;
    To: MailpitAddress[] | null;
    Cc: MailpitAddress[] | null;
    Bcc: MailpitAddress[] | null;
    Subject: string;
    Created: string;
    Snippet: string;
}

interface MailpitSearchResponse {
    messages: MailpitMessage[];
}

interface MailpitFullMessage extends MailpitMessage {
    Date: string;
    Text: string;
    HTML: string;
}

/**
 * Mailpit (https://mailpit.axllent.org) is a self-hosted catch-all SMTP server, eg. run as container
 * next to the system under test, or the one DDEV ships with. It keeps all mail in one store,
 * so the mailbox is the subset of mails addressed to the current address.
 */
class MailpitService extends MailboxService {

    API_URL: string;
    PROVIDER: MailboxProvider = 'MAILPIT';
    /** Max number of emails fetched by fetchEmailList(). */
    MAX_EMAILS = 250;

    private readonly domain: string;
    private readonly smtpHost: string;
    private readonly smtpPort: number;
    private address = '';

    constructor(options: MailpitOptions = {}) {
        super();
        const config = resolveSelfHostedOptions('MAILPIT', options, 'http://localhost:8025', 'mailpit.local', 1025);
        this.API_URL = config.url;
        this.domain = config.domain;
        this.smtpHost = config.smtpHost;
        this.smtpPort = config.smtpPort;
    }

    private async sendRequest<T>(config: AxiosRequestConfig): Promise<AxiosResponse<T> | undefined> {
        try {
            return await axios.request<T>({ ...config, baseURL: `${this.API_URL}/api/v1` });
        } catch {
            return;
        }
    }

    /** Mailpit search query matching all mails sent to the current address. */
    private get searchQuery(): string {
        return `addressed:"${this.address}"`;
    }

    /**
     * The search matches substrings, so check the recipients for the exact address.
     */
    private isAddressedToMailbox(msg: MailpitMessage): boolean {
        return [...(msg.To ?? []), ...(msg.Cc ?? []), ...(msg.Bcc ?? [])]
            .some(recipient => recipient.Address.toLowerCase() === this.address);
    }

    private static toEmailResponse(msg: MailpitMessage, body = ''): EmailResponse {
        const sender = msg.From;
        return {
            mail_id: msg.ID,
            mail_from: sender ? (sender.Name ? `${sender.Name} <${sender.Address}>` : sender.Address) : '',
            mail_timestamp: new Date(msg.Created).getTime(),
            mail_subject: msg.Subject,
            mail_excerpt: msg.Snippet || '',
            mail_body: body,
        };
    }

    /**
     * Generate a random address. Fails if the Mailpit instance is not reachable.
     * @returns email address
     */
    async createEmailAddress(): Promise<string> {
        if (!await this.sendRequest({ method: 'GET', url: '/info' })) {
            throw new Error(`Could not reach Mailpit at ${this.API_URL}.`);
        }
        this.address = `${Math.random().toString(36).substring(2, 12)}@${this.domain}`;
        return this.address;
    }

    /**
     * Use the given address. A local part only is completed with the configured domain.
     * @param emailAddress
     * @returns True
     */
    async setEmailAddress(emailAddress: string): Promise<boolean> {
        this.address = (emailAddress.includes('@') ? emailAddress : `${emailAddress}@${this.domain}`).toLowerCase();
        return true;
    }

    /**
     * SMTP server the system under test has to send its mails through. Mailpit needs no authentication by default.
     */
    getSmtpConfig(): SmtpConfig | undefined {
        return { host: this.smtpHost, port: this.smtpPort, secure: false, user: '', pass: '' };
    }

    /**
     * Get the emails sent to the current address, newest first. The body is not included,
     * use fetchEmailById() for that.
     * @returns Array of emails
     */
    async fetchEmailList(): Promise<EmailResponse[]> {
        const response = await this.sendRequest<MailpitSearchResponse>({
            method: 'GET', url: '/search', params: { query: this.searchQuery, limit: this.MAX_EMAILS },
        });
        const messages = response?.data?.messages ?? [];
        return messages
            .filter(msg => this.isAddressedToMailbox(msg))
            .map(msg => MailpitService.toEmailResponse(msg))
            .sort((a, b) => b.mail_timestamp - a.mail_timestamp);
    }

    /**
     * Delete all emails sent to the current address.
     * @param emailAddress
     * @returns True on success, false on failure
     */
    async forgetEmailAddress(_emailAddress: string): Promise<boolean> {
        const emails = await this.fetchEmailList();
        if (emails.length) {
            const response = await this.sendRequest({
                method: 'DELETE', url: '/messages', data: { IDs: emails.map(email => email.mail_id) },
            });
            if (response?.status !== 200) return false;
        }
        this.address = '';
        return true;
    }

    async deleteEmailById(emailId: string): Promise<boolean> {
        const response = await this.sendRequest({ method: 'DELETE', url: '/messages', data: { IDs: [emailId] } });
        return response?.status === 200;
    }

    async fetchEmailById(emailId: string): Promise<EmailResponse | undefined> {
        const response = await this.sendRequest<MailpitFullMessage>({
            method: 'GET', url: `/message/${encodeURIComponent(emailId)}`,
        });
        const msg = response?.data;
        if (!msg?.ID) return;
        return MailpitService.toEmailResponse({ ...msg, Created: msg.Created || msg.Date }, msg.HTML || msg.Text || '');
    }

    /**
     * Send an email through Mailpit's SMTP server to this mailbox.
     * @returns A `boolean` representing success or failure.
     */
    async sendSelfMail(subject: string, body: string): Promise<boolean> {
        const transporter = nodemailer.createTransport({ host: this.smtpHost, port: this.smtpPort, secure: false });
        try {
            const info = await transporter.sendMail({ from: this.address, to: this.address, subject, html: body });
            return info.accepted.length > 0;
        } catch {
            return false;
        } finally {
            transporter.close();
        }
    }
}

export default MailpitService;
