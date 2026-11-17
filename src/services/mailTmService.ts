import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { EmailResponse, MailboxProvider } from '../types';
import MailboxService from './mailboxService';

interface MailTmDomain {
    domain: string;
    isActive: boolean;
}

interface MailTmAddress {
    address: string;
    name: string;
}

interface MailTmMessage {
    id: string;
    from: MailTmAddress;
    subject: string;
    intro: string;
    createdAt: string;
}

interface MailTmFullMessage extends MailTmMessage {
    text?: string;
    html?: string[];
}

interface MailTmTokenResponse {
    id: string;
    token: string;
}

class MailTmService extends MailboxService {

    API_URL = 'https://api.mail.tm';
    PROVIDER: MailboxProvider = 'MAILTM';

    private address = '';
    private password = '';
    private accountId = '';
    private token = '';

    /**
     * Send a request to the Mail.tm API. Retries up to 3 times on 429 responses,
     * Mail.tm allows 8 requests per second per IP.
     * @returns AxiosResponse on success, undefined on failure.
     */
    private async sendRequest<T>(config: AxiosRequestConfig, isRetry = 0): Promise<AxiosResponse<T> | undefined> {
        try {
            return await axios.request<T>({
                ...config,
                baseURL: this.API_URL,
                headers: {
                    'Accept': 'application/json',
                    ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
                    ...config.headers,
                },
            });
        } catch (error: unknown) {
            if (axios.isAxiosError(error) && error.response?.status === 429 && isRetry < 3) {
                await this.sleep(1000);
                return this.sendRequest(config, isRetry + 1);
            }
            return;
        }
    }

    private static toEmailResponse(msg: MailTmMessage, body = ''): EmailResponse {
        return {
            mail_id: msg.id,
            mail_from: msg.from.name ? `${msg.from.name} <${msg.from.address}>` : msg.from.address,
            mail_timestamp: new Date(msg.createdAt).getTime(),
            mail_subject: msg.subject,
            mail_excerpt: msg.intro || '',
            mail_body: body,
        };
    }

    private static randomString(length: number): string {
        let result = '';
        while (result.length < length) {
            result += Math.random().toString(36).substring(2);
        }
        return result.substring(0, length);
    }

    /**
     * Get a domain Mail.tm currently accepts new accounts for.
     */
    private async fetchDomain(): Promise<string> {
        const response = await this.sendRequest<MailTmDomain[]>({ method: 'GET', url: '/domains' });
        const domain = response?.data?.find(d => d.isActive);
        if (!domain) throw new Error('Could not fetch a Mail.tm domain.');
        return domain.domain;
    }

    private async createAccount(address: string, password: string): Promise<boolean> {
        const response = await this.sendRequest({ method: 'POST', url: '/accounts', data: { address, password } });
        return response?.status === 201;
    }

    /**
     * Log in and store the session token.
     * @returns True on valid credentials
     */
    private async login(address: string, password: string): Promise<boolean> {
        this.token = '';
        const response = await this.sendRequest<MailTmTokenResponse>({
            method: 'POST', url: '/token', data: { address, password },
        });
        if (!response?.data?.token) return false;
        this.address = address;
        this.password = password;
        this.accountId = response.data.id;
        this.token = response.data.token;
        return true;
    }

    /**
     * Create a new account with a random address and password on a domain Mail.tm currently offers.
     * Use getPassword() to get the password needed to re-use the address later.
     * @returns email address
     */
    async createEmailAddress(): Promise<string> {
        const address = `${MailTmService.randomString(10)}@${await this.fetchDomain()}`;
        const password = MailTmService.randomString(16);
        if (!await this.createAccount(address, password) || !await this.login(address, password)) {
            throw new Error('Could not create email address.');
        }
        return address;
    }

    /**
     * Use the given address. Logs into the account if it exists, otherwise the account is
     * created with the given password. The domain has to be one Mail.tm offers, see
     * https://api.mail.tm/domains. If only a local part is given, the current domain is used.
     * @param emailAddress
     * @param password - required, Mail.tm accounts are password protected.
     * @returns True on success, false on wrong password or unavailable domain.
     */
    async setEmailAddress(emailAddress: string, password?: string): Promise<boolean> {
        if (!password) return false;
        const address = emailAddress.includes('@')
            ? emailAddress.toLowerCase()
            : `${emailAddress.toLowerCase()}@${await this.fetchDomain()}`;
        if (await this.login(address, password)) return true;
        return await this.createAccount(address, password) && this.login(address, password);
    }

    getPassword(): string | undefined {
        return this.password || undefined;
    }

    /**
     * Get the current list of emails, newest first. The body is not included, use fetchEmailById() for that.
     * @returns Array of emails
     */
    async fetchEmailList(): Promise<EmailResponse[]> {
        const response = await this.sendRequest<MailTmMessage[]>({ method: 'GET', url: '/messages' });
        const messages = response?.data ?? [];
        return messages
            .map(msg => MailTmService.toEmailResponse(msg))
            .sort((a, b) => b.mail_timestamp - a.mail_timestamp);
    }

    /**
     * Delete the account, including all its emails.
     * @param emailAddress
     * @returns True on success, false on failure
     */
    async forgetEmailAddress(_emailAddress: string): Promise<boolean> {
        if (!this.accountId) return false;
        const response = await this.sendRequest({ method: 'DELETE', url: `/accounts/${this.accountId}` });
        if (response?.status !== 204) return false;
        this.address = '';
        this.password = '';
        this.accountId = '';
        this.token = '';
        return true;
    }

    async deleteEmailById(emailId: string): Promise<boolean> {
        const response = await this.sendRequest({ method: 'DELETE', url: `/messages/${emailId}` });
        return response?.status === 204;
    }

    async fetchEmailById(emailId: string): Promise<EmailResponse | undefined> {
        const response = await this.sendRequest<MailTmFullMessage>({ method: 'GET', url: `/messages/${emailId}` });
        const msg = response?.data;
        if (!msg?.id) return;
        const body = msg.html?.length ? msg.html.join('') : (msg.text || '');
        return MailTmService.toEmailResponse(msg, body);
    }

    sendSelfMail(_subject: string, _body: string): Promise<boolean> {
        throw new Error('Method not implemented for the Mail.tm provider.');
    }
}

export default MailTmService;
