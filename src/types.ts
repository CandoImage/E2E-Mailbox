export type MailboxProvider = 'DEVELOPER' | 'GUERRILLA' | 'MAILDROP' | 'ETHEREAL' | 'MAILTM' | 'MAILGW' | 'MAILSAC' | 'HARAKIRI' | 'TESTMAIL' | 'INBUCKET' | 'MAILPIT';

export interface MailsacOptions {
    /** Mailsac API key, falls back to the MAILSAC_API_KEY environment variable. */
    apiKey?: string;
}

export interface TestmailOptions {
    /** testmail.app API key, falls back to the TESTMAIL_API_KEY environment variable. */
    apiKey?: string;
    /** testmail.app namespace, falls back to the TESTMAIL_NAMESPACE environment variable. */
    namespace?: string;
}

/**
 * Configuration of a self-hosted catch-all SMTP server. Each option falls back to the
 * <PROVIDER>_URL, <PROVIDER>_DOMAIN, <PROVIDER>_SMTP_HOST and <PROVIDER>_SMTP_PORT
 * environment variables, eg. INBUCKET_URL or MAILPIT_URL, then to the provider default.
 */
export interface SelfHostedOptions {
    /** Base URL of the web UI / REST API. Default Inbucket: http://localhost:9000, Mailpit: http://localhost:8025 */
    url?: string;
    /** Domain used for generated addresses. Default: inbucket.local / mailpit.local */
    domain?: string;
    /** SMTP host. Default: the host of the url. */
    smtpHost?: string;
    /** SMTP port. Default Inbucket: 2500, Mailpit: 1025 */
    smtpPort?: number;
}

export type InbucketOptions = SelfHostedOptions;
export type MailpitOptions = SelfHostedOptions;

export interface MailboxOptions {
    mailsac?: MailsacOptions;
    testmail?: TestmailOptions;
    inbucket?: InbucketOptions;
    mailpit?: MailpitOptions;
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