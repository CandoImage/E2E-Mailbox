import { SelfHostedOptions } from '../types';

export interface ResolvedSelfHostedOptions {
    url: string;
    domain: string;
    smtpHost: string;
    smtpPort: number;
}

/**
 * Resolve the configuration of a self-hosted provider: explicit options first, then the
 * <PREFIX>_URL, <PREFIX>_DOMAIN, <PREFIX>_SMTP_HOST and <PREFIX>_SMTP_PORT environment variables,
 * then the provider defaults. The SMTP host defaults to the host of the url.
 */
export function resolveSelfHostedOptions(
    envPrefix: string,
    options: SelfHostedOptions,
    defaultUrl: string,
    defaultDomain: string,
    defaultSmtpPort: number,
): ResolvedSelfHostedOptions {
    const env = process.env;
    const url = (options.url || env[`${envPrefix}_URL`] || defaultUrl).replace(/\/+$/, '');
    return {
        url,
        domain: options.domain || env[`${envPrefix}_DOMAIN`] || defaultDomain,
        smtpHost: options.smtpHost || env[`${envPrefix}_SMTP_HOST`] || new URL(url).hostname,
        smtpPort: options.smtpPort || Number(env[`${envPrefix}_SMTP_PORT`]) || defaultSmtpPort,
    };
}
