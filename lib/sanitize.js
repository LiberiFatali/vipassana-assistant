/**
 * Safe Domain Gating (Security Task 3.1) — verbatim JS port of
 * TRUSTED_DOMAINS + sanitize_urls() from the original Python agent.
 *
 * This is the programmatic "Blue Team" backstop that strips any URL not on the
 * approved domain list from agent output, independent of the system-prompt
 * instruction that tells the model to do the same thing. Both layers are required.
 */

export const TRUSTED_DOMAINS = /^https?:\/\/([a-zA-Z0-9-]+\.)*(vridhamma\.org|ucenlist\.org)([/?#]|$)/;

const URL_PATTERN = /https?:\/\/[^\s\)\]"']+/g;

/**
 * Post-process agent output: strip any URL that does not match trusted domains.
 * Replaces untrusted links with a safety notice.
 */
export function sanitize_urls(text) {
  return text.replace(URL_PATTERN, (url) => {
    if (TRUSTED_DOMAINS.test(url)) {
      return url;
    }
    return "[🔒 Link removed: only official ucenlist.org and vridhamma.org links are shared]";
  });
}
