import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import * as nodemailer from 'nodemailer';
import { EmailResponse, InbucketOptions, MailboxProvider, SmtpConfig } from '../types';
import MailboxService from './mailboxService';
import { resolveSelfHostedOptions } from './selfHostedOptions';

interface InbucketMessage {
    mailbox: string;
    id: string;
    from: string;
    subject: string;
    'posix-millis': number;
}

interface InbucketFullMessage extends InbucketMessage {
    body: {
        text: string;
        html: string;
    };
}

/**
 * Inbucket (https://inbucket.org) is a self-hosted catch-all SMTP server, eg. run as container
 * next to the system under test. Every address works without being created first, the mailbox
 * name is the local part of the address.
 */
class InbucketService extends MailboxService {

    API_URL: string;
    PROVIDER: MailboxProvider = 'INBUCKET';

    private readonly domain: string;
    private readonly smtpHost: string;
    private readonly smtpPort: number;
    private mailboxName = '';

    constructor(options: InbucketOptions = {}) {
        super();
        const config = resolveSelfHostedOptions('INBUCKET', options, 'http://localhost:9000', 'inbucket.local', 2500);
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

    private get mailboxPath(): string {
        return `/mailbox/${encodeURIComponent(this.mailboxName)}`;
    }

    private get address(): string {
        return `${this.mailboxName}@${this.domain}`;
    }

    private static toEmailResponse(msg: InbucketMessage, body = ''): EmailResponse {
        return {
            mail_id: msg.id,
            mail_from: msg.from,
            mail_timestamp: msg['posix-millis'],
            mail_subject: msg.subject,
            mail_excerpt: '',
            mail_body: body,
        };
    }

    /**
     * Generate a random address. Fails if the Inbucket instance is not reachable.
     * @returns email address
     */
    async createEmailAddress(): Promise<string> {
        this.mailboxName = Math.random().toString(36).substring(2, 12);
        if (!await this.sendRequest({ method: 'GET', url: this.mailboxPath })) {
            this.mailboxName = '';
            throw new Error(`Could not reach Inbucket at ${this.API_URL}.`);
        }
        return this.address;
    }

    /**
     * Use the given address. Inbucket accepts any domain, only the local part names the mailbox.
     * @param emailAddress
     * @returns True
     */
    async setEmailAddress(emailAddress: string): Promise<boolean> {
        this.mailboxName = emailAddress.split('@')[0].toLowerCase();
        return true;
    }

    /**
     * SMTP server the system under test has to send its mails through. Inbucket needs no authentication.
     */
    getSmtpConfig(): SmtpConfig | undefined {
        return { host: this.smtpHost, port: this.smtpPort, secure: false, user: '', pass: '' };
    }

    /**
     * Get the current list of emails, newest first. The body is not included, use fetchEmailById() for that.
     * @returns Array of emails
     */
    async fetchEmailList(): Promise<EmailResponse[]> {
        const response = await this.sendRequest<InbucketMessage[]>({ method: 'GET', url: this.mailboxPath });
        const messages = response?.data ?? [];
        return messages
            .map(msg => InbucketService.toEmailResponse(msg))
            .sort((a, b) => b.mail_timestamp - a.mail_timestamp);
    }

    /**
     * Purge the mailbox, deleting all its emails.
     * @param emailAddress
     * @returns True on success, false on failure
     */
    async forgetEmailAddress(_emailAddress: string): Promise<boolean> {
        const response = await this.sendRequest({ method: 'DELETE', url: this.mailboxPath });
        if (response?.status !== 200) return false;
        this.mailboxName = '';
        return true;
    }

    async deleteEmailById(emailId: string): Promise<boolean> {
        const response = await this.sendRequest({
            method: 'DELETE', url: `${this.mailboxPath}/${encodeURIComponent(emailId)}`,
        });
        return response?.status === 200;
    }

    async fetchEmailById(emailId: string): Promise<EmailResponse | undefined> {
        const response = await this.sendRequest<InbucketFullMessage>({
            method: 'GET', url: `${this.mailboxPath}/${encodeURIComponent(emailId)}`,
        });
        const msg = response?.data;
        if (!msg?.id) return;
        return InbucketService.toEmailResponse(msg, msg.body?.html || msg.body?.text || '');
    }

    /**
     * Send an email through Inbucket's SMTP server to this mailbox.
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

export default InbucketService;
