import axios from 'axios';
import { ImapFlow } from 'imapflow';
import { ParsedMail, simpleParser } from 'mailparser';
import * as nodemailer from 'nodemailer';
import { EmailResponse, MailboxProvider, SmtpConfig } from '../types';
import MailboxService from './mailboxService';

interface ServerConfig {
    host: string;
    port: number;
    secure: boolean;
}

interface CreateAccountResponse {
    status: string;
    user: string;
    pass: string;
    smtp: ServerConfig;
    imap: ServerConfig;
}

class EtherealMailService extends MailboxService {

    API_URL = 'https://api.nodemailer.com/user';
    PROVIDER: MailboxProvider = 'ETHEREAL';

    private user = '';
    private pass = '';
    private smtp: ServerConfig = { host: 'smtp.ethereal.email', port: 587, secure: false };
    private imap: ServerConfig = { host: 'imap.ethereal.email', port: 993, secure: true };

    /**
     * Open an IMAP connection, lock the INBOX and run the callback against it.
     * Ethereal has no REST API for reading mail, so all reads go through IMAP.
     * A fresh connection is used per call to avoid dealing with idle timeouts.
     * @param callback
     * @returns the callback result
     */
    private async withInbox<T>(callback: (client: ImapFlow) => Promise<T>): Promise<T> {
        const client = new ImapFlow({
            ...this.imap,
            auth: { user: this.user, pass: this.pass },
            logger: false,
        });
        await client.connect();
        try {
            const lock = await client.getMailboxLock('INBOX');
            try {
                return await callback(client);
            } finally {
                lock.release();
            }
        } finally {
            await client.logout();
        }
    }

    /**
     * Convert a raw MIME message to the shared EmailResponse format.
     * @param source - raw message source
     * @param mailId - IMAP UID of the message
     * @returns EmailResponse
     */
    private static async convertMimeToEmailResponse(source: Buffer, mailId: string): Promise<EmailResponse> {
        const parsedMessage: ParsedMail = await simpleParser(source);
        return {
            mail_id: mailId,
            mail_from: parsedMessage.from ? parsedMessage.from.text : '',
            mail_timestamp: parsedMessage.date ? parsedMessage.date.getTime() : 0,
            mail_subject: parsedMessage.subject || '',
            mail_excerpt: '',
            mail_body: parsedMessage.html || parsedMessage.textAsHtml || '',
        };
    }

    /**
     * Create a new Ethereal account. Ethereal is a catch-all SMTP service: it never
     * delivers mail, instead every message sent through the account's SMTP server
     * lands in the account's own inbox, regardless of the recipient. Point the system
     * under test at the credentials from getSmtpConfig() to capture its mails.
     * @returns email address of the created account
     */
    async createEmailAddress(): Promise<string> {
        const response = await axios.post<CreateAccountResponse>(this.API_URL, {
            requestor: 'e2e-mailbox',
            version: '1',
        }).catch(() => undefined);
        const account = response?.data;
        if (account?.status !== 'success' || !account.user) throw new Error('Could not create email address.');
        this.user = account.user;
        this.pass = account.pass;
        this.smtp = account.smtp;
        this.imap = account.imap;
        return account.user;
    }

    /**
     * Re-use an existing Ethereal account. Ethereal accounts are password protected,
     * so the password returned by getSmtpConfig() when the account was created is required.
     * @param emailAddress
     * @param password
     * @returns True if the credentials are valid, false otherwise
     */
    async setEmailAddress(emailAddress: string, password?: string): Promise<boolean> {
        if (!password) return false;
        this.user = emailAddress;
        this.pass = password;
        try {
            await this.withInbox(async () => undefined);
            return true;
        } catch {
            return false;
        }
    }

    getSmtpConfig(): SmtpConfig | undefined {
        if (!this.user) return;
        return { ...this.smtp, user: this.user, pass: this.pass };
    }

    /**
     * Get the current list of emails from the Ethereal inbox, newest first.
     * The body is not included, use fetchEmailById() for that.
     * @returns Array of emails
     */
    async fetchEmailList(): Promise<EmailResponse[]> {
        const emailList = await this.withInbox(async client => {
            const emails: EmailResponse[] = [];
            const mailbox = client.mailbox;
            if (!mailbox || !mailbox.exists) return emails;
            for await (const message of client.fetch('1:*', { uid: true, envelope: true, internalDate: true })) {
                const sender = message.envelope?.from?.[0];
                const receivedAt = message.internalDate || message.envelope?.date;
                emails.push({
                    mail_id: String(message.uid),
                    mail_from: sender ? (sender.name ? `${sender.name} <${sender.address}>` : sender.address || '') : '',
                    mail_timestamp: receivedAt ? new Date(receivedAt).getTime() : 0,
                    mail_subject: message.envelope?.subject || '',
                    mail_excerpt: '',
                    mail_body: '',
                });
            }
            return emails;
        });
        return emailList.sort((a, b) => Number(b.mail_id) - Number(a.mail_id));
    }

    /**
     * Forget the current email address by clearing the local account state.
     * Ethereal offers no API to delete an account, it expires on its own.
     * @param emailAddress
     * @returns True on success
     */
    async forgetEmailAddress(_emailAddress: string): Promise<boolean> {
        this.user = '';
        this.pass = '';
        return true;
    }

    /**
     * Delete a specific email by ID.
     * @param emailId
     * @returns true on success, false on failure
     */
    async deleteEmailById(emailId: string): Promise<boolean> {
        try {
            return await this.withInbox(client => client.messageDelete(emailId, { uid: true }));
        } catch {
            return false;
        }
    }

    /**
     * Get the full contents of an email by ID.
     * @param emailId
     * @returns EmailResponse on success, undefined if not found
     */
    async fetchEmailById(emailId: string): Promise<EmailResponse | undefined> {
        const source = await this.withInbox(async client => {
            const message = await client.fetchOne(emailId, { source: true }, { uid: true });
            return message ? message.source : undefined;
        });
        if (!source) return;
        return EtherealMailService.convertMimeToEmailResponse(source, emailId);
    }

    /**
     * Send an email through the account's SMTP server, which ends up in its own inbox.
     * @param subject
     * @param body
     * @returns A `boolean` representing success or failure.
     */
    async sendSelfMail(subject: string, body: string): Promise<boolean> {
        const transporter = nodemailer.createTransport({
            ...this.smtp,
            auth: { user: this.user, pass: this.pass },
        });
        try {
            const info = await transporter.sendMail({ from: this.user, to: this.user, subject, html: body });
            return info.accepted.length > 0;
        } catch {
            return false;
        } finally {
            transporter.close();
        }
    }
}

export default EtherealMailService;
