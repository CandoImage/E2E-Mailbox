export type MailboxProvider = 'DEVELOPER' | 'GUERRILLA' | 'MAILDROP' | 'ETHEREAL' | 'MAILTM' | 'MAILSAC' | 'INBUCKET';

export interface MailsacOptions {
    /** Mailsac API key, falls back to the MAILSAC_API_KEY environment variable. */
    apiKey?: string;
}

export interface InbucketOptions {
    /** Base URL of the Inbucket web UI / REST API, falls back to INBUCKET_URL or http://localhost:9000. */
    url?: string;
    /** Domain used for generated addresses, falls back to INBUCKET_DOMAIN or inbucket.local. */
    domain?: string;
    /** SMTP host, falls back to INBUCKET_SMTP_HOST or the host of the url. */
    smtpHost?: string;
    /** SMTP port, falls back to INBUCKET_SMTP_PORT or 2500. */
    smtpPort?: number;
}

export interface MailboxOptions {
    mailsac?: MailsacOptions;
    inbucket?: InbucketOptions;
}

export interface SmtpConfig {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
}

export interface CreateEmailResponse {
    email_addr: string;
    email_timestamp: number;
    alias: string;
    sid_token: string;
}

export interface EmailListResponse {
    list: EmailResponse[];
}

export interface EmailResponse {
    mail_id: string;
    mail_from: string;
    mail_timestamp: number;
    mail_subject: string;
    mail_excerpt: string;
    mail_body: string;
}

export interface SetEmailResponse {
    email_addr: string;
    email_timestamp: string;
    s_active: string;
    s_date: string;
    s_time: string;
    s_time_expires: string;
}