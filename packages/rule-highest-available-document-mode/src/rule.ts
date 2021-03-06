/**
 * @fileoverview Check if browsers that support document modes are
 * informed to use the highest on available.
 */

/*
 * ------------------------------------------------------------------------------
 * Requirements
 * ------------------------------------------------------------------------------
 */

import { Category } from 'sonarwhal/dist/src/lib/enums/category';
import { IAsyncHTMLDocument, IAsyncHTMLElement, IRule, TraverseEnd, RuleMetadata } from 'sonarwhal/dist/src/lib/types';
import { isLocalFile, normalizeString } from 'sonarwhal/dist/src/lib/utils/misc';
import { RuleContext } from 'sonarwhal/dist/src/lib/rule-context';
import { RuleScope } from 'sonarwhal/dist/src/lib/enums/rulescope';

/*
 * ------------------------------------------------------------------------------
 * Public
 * ------------------------------------------------------------------------------
 */

export default class HighestAvailableDocumentModeRule implements IRule {

    public static readonly meta: RuleMetadata = {
        docs: {
            category: Category.interoperability,
            description: 'Require highest available document mode'
        },
        id: 'highest-available-document-mode',
        schema: [{
            additionalProperties: false,
            properties: { requireMetaTag: { type: 'boolean' } },
            type: ['object', null]
        }],
        scope: RuleScope.any
    }

    public constructor(context: RuleContext) {

        let requireMetaTag: boolean = false;
        let suggestRemoval: boolean = false;

        /*
         * This function exists because not all connector (e.g.: jsdom)
         * support matching attribute values case-insensitively.
         *
         * https://www.w3.org/TR/selectors4/#attribute-case
         */

        const getXUACompatibleMetaTags = (elements: Array<IAsyncHTMLElement>): Array<IAsyncHTMLElement> => {
            return elements.filter((element: IAsyncHTMLElement) => {
                return (element.getAttribute('http-equiv') !== null &&
                    normalizeString(element.getAttribute('http-equiv')) === 'x-ua-compatible');
            });
        };

        const checkHeader = async (resource: string, responseHeaders: object) => {
            const headerValue = normalizeString(responseHeaders['x-ua-compatible']);

            if (headerValue === null) {

                /*
                 * There is no need to require the HTTP header if:
                 *
                 *  * the user required the meta tag to be specified.
                 *  * the targeted browsers don't include the ones that
                 *    support document modes
                 */

                if (!requireMetaTag && !suggestRemoval) {
                    await context.report(resource, null, `'x-ua-compatible' header was not specified`);
                }

                return;
            }

            /*
             * If the HTTP response header is included, but the targeted
             * browsers don't include the browser that support document
             * modes, suggest not sending the header.
             */

            if (suggestRemoval) {
                await context.report(resource, null, `'x-ua-compatible' header is not needed`);

                return;
            }

            if (headerValue !== 'ie=edge') {
                await context.report(resource, null, `'x-ua-compatible' header value should be 'ie=edge'`);
            }

            /*
             * Note: The check if the X-UA-Compatible HTTP response
             *       header is sent for non-HTML documents is covered
             *       by the `no-html-only-headers` rule.
             */

        };

        const checkMetaTag = async (resource: string) => {

            const pageDOM: IAsyncHTMLDocument = context.pageDOM as IAsyncHTMLDocument;
            const XUACompatibleMetaTags: Array<IAsyncHTMLElement> = getXUACompatibleMetaTags(await pageDOM.querySelectorAll('meta'));

            /*
             * By default, if the user did not request the meta tag to
             * be specified, prefer the HTTP response header over using
             * the meta tag, as the meta tag will not always work.
             */

            if (!requireMetaTag || suggestRemoval) {
                if (XUACompatibleMetaTags.length !== 0) {

                    const errorMessage = suggestRemoval ? 'Meta tag is not needed' : 'Meta tag usage is discouraged, use equivalent HTTP header';

                    for (const metaTag of XUACompatibleMetaTags) {
                        await context.report(resource, metaTag, errorMessage);
                    }
                }

                return;
            }

            // If the user requested the meta tag to be specified.

            if (XUACompatibleMetaTags.length === 0) {
                await context.report(resource, null, `No 'x-ua-compatible' meta tag was specified`);

                return;
            }

            /*
             * Treat the first X-UA-Compatible meta tag as the one
             * the user intended to use, and check if:
             */

            const XUACompatibleMetaTag: IAsyncHTMLElement = XUACompatibleMetaTags[0];
            const contentValue: string = normalizeString(XUACompatibleMetaTag.getAttribute('content'));

            // * it has the value `ie=edge`.

            if (contentValue !== 'ie=edge') {
                await context.report(resource, XUACompatibleMetaTag, `The value of 'content' should be 'ie=edge'`);
            }

            /*
             * * it's specified in the `<head>` before all other
             *   tags except for the `<title>` and other `<meta>` tags.
             *
             *   https://msdn.microsoft.com/en-us/library/jj676915.aspx
             */

            const headElements: Array<IAsyncHTMLElement> = await pageDOM.querySelectorAll('head *');
            let metaTagIsBeforeRequiredElements: boolean = true;

            for (const headElement of headElements) {
                if (headElement.isSame(XUACompatibleMetaTag)) {
                    if (!metaTagIsBeforeRequiredElements) {
                        await context.report(resource, XUACompatibleMetaTag, `Meta tag needs to be included before all other tags except for the '<title>' and the other '<meta>' tags`);
                    }

                    break;
                }

                if (!['title', 'meta'].includes(headElement.nodeName.toLowerCase())) {
                    metaTagIsBeforeRequiredElements = false;
                }
            }

            // * it's specified in the `<body>`.

            const bodyMetaTags: Array<IAsyncHTMLElement> = getXUACompatibleMetaTags(await pageDOM.querySelectorAll('body meta'));

            if ((bodyMetaTags.length > 0) && bodyMetaTags[0].isSame(XUACompatibleMetaTag)) {
                await context.report(resource, XUACompatibleMetaTag, `Meta tag should not be specified in the '<body>'`);

                return;
            }

            // All other meta tags should not be included.

            if (XUACompatibleMetaTags.length > 1) {
                const metaTags = XUACompatibleMetaTags.slice(1);

                for (const metaTag of metaTags) {
                    await context.report(resource, metaTag, `A 'x-ua-compatible' meta tag was already specified`);
                }
            }
        };

        const loadRuleConfigs = () => {
            requireMetaTag = (context.ruleOptions && context.ruleOptions.requireMetaTag) || false;

            /*
             * Document modes are only supported by Internet Explorer 8/9/10.
             * https://msdn.microsoft.com/en-us/library/jj676915.aspx
             */

            suggestRemoval = ['ie 8', 'ie 9', 'ie 10'].every((e) => {
                return !context.targetedBrowsers.includes(e);
            });
        };

        const validate = async (event: TraverseEnd) => {
            const { resource }: { resource: string } = event;

            // The following check doesn't make sense for local files.

            if (!isLocalFile(resource)) {
                checkHeader(resource, context.pageHeaders);
            }

            await checkMetaTag(resource);
        };

        loadRuleConfigs();

        context.on('traverse::end', validate);
    }
}
