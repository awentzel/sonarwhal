/**
 * @fileoverview Check if a single `<meta name="theme-color">` is
 * specified in the `<head>`.
 */

/*
 * ------------------------------------------------------------------------------
 * Requirements
 * ------------------------------------------------------------------------------
 */

import { isSupported } from 'caniuse-api';
import { get as parseColor } from 'color-string';

import { Category } from 'sonarwhal/dist/src/lib/enums/category';
import {
    IAsyncHTMLDocument,
    IAsyncHTMLElement,
    IRule,
    RuleMetadata,
    TraverseEnd
} from 'sonarwhal/dist/src/lib/types';
import {
    isHTMLDocument,
    normalizeString
} from 'sonarwhal/dist/src/lib/utils/misc';
import { RuleContext } from 'sonarwhal/dist/src/lib/rule-context';
import { RuleScope } from 'sonarwhal/dist/src/lib/enums/rulescope';

/*
 * ------------------------------------------------------------------------------
 * Public
 * ------------------------------------------------------------------------------
 */

export default class MetaThemeColorRule implements IRule {

    public static readonly meta: RuleMetadata = {
        docs: {
            category: Category.pwa,
            description: 'Require `<meta name="theme-color">`'
        },
        id: 'meta-theme-color',
        schema: [],
        scope: RuleScope.any
    }

    public constructor(context: RuleContext) {

        /*
         * This function exists because not all connector (e.g.: jsdom)
         * support matching attribute values case-insensitively.
         *
         * https://www.w3.org/TR/selectors4/#attribute-case
         */

        const getThemeColorMetaTags = (elements: Array<IAsyncHTMLElement>): Array<IAsyncHTMLElement> => {
            return elements.filter((element) => {
                return normalizeString(element.getAttribute('name')) === 'theme-color';
            });
        };

        const checkNameAttributeValue = async (resource: string, element: IAsyncHTMLElement) => {
            /*
             *  Something such as `name=" theme-color"` is not valid,
             *  but if used, the user probably wanted `name="theme-color"`.
             *
             *  From: https://html.spec.whatwg.org/multipage/semantics.html#meta-theme-color
             *
             *  " The element has a name attribute, whose value is
             *    an ASCII case-insensitive match for `theme-color` "
             */

            const nameAttributeValue = element.getAttribute('name');

            if (nameAttributeValue && nameAttributeValue !== nameAttributeValue.trim()) {
                await context.report(resource, element, `'name' attribute needs to be 'theme-color' (not '${nameAttributeValue}')`);
            }
        };

        const checkContentAttributeValue = async (resource: string, element: IAsyncHTMLElement) => {
            const contentValue = element.getAttribute('content');
            const normalizedContentValue = normalizeString(contentValue, '');
            const color = parseColor(normalizedContentValue);

            if (color === null) {
                await context.report(resource, element, `'content' attribute value ('${contentValue}') is invalid`);

                return;
            }

            /*
             * `theme-color` can accept any CSS `<color>`:
             *
             *    * https://html.spec.whatwg.org/multipage/semantics.html#meta-theme-color
             *    * https://drafts.csswg.org/css-color/#typedef-color
             *
             *  However, `HWB` and `RGBA` value are not supported
             *  everywhere `theme-color` is. Also, values such as
             *  `currentcolor` don't make sense, but they will be
             *  catched by the above check.
             *
             *  See also:
             *
             *    * https://developer.mozilla.org/en-US/docs/Web/CSS/color_value#Browser_compatibility
             *    * https://cs.chromium.org/chromium/src/third_party/WebKit/Source/platform/graphics/Color.cpp?rcl=6263bcf0ec9f112b5f0d84fc059c759302bd8c67
             */

            const targetedBrowsers: string = context.targetedBrowsers.join();
            const rgbaIsSupported = targetedBrowsers && isSupported('css-rrggbbaa', targetedBrowsers);
            const rgbaRegex = /^#([0-9a-fA-F]{4}){1,2}$/;

            if (
                // `HWB` is not supported anywhere (?).
                color.model === 'hwb' ||

                // `RGBA` support depends on the browser.
                (color.model === 'rgb' &&
                    rgbaRegex.test(normalizedContentValue) &&
                    !rgbaIsSupported)
            ) {
                await context.report(resource, element, `'content' attribute value ('${contentValue}') is not unsupported`);
            }
        };

        const validate = async (event: TraverseEnd) => {
            const { resource }: { resource: string } = event;

            // The following checks don't make sense for non-HTML documents.

            if (!isHTMLDocument(resource, context.pageHeaders)) {
                return;
            }

            const pageDOM: IAsyncHTMLDocument = context.pageDOM as IAsyncHTMLDocument;
            const themeColorMetaTags: Array<IAsyncHTMLElement> = getThemeColorMetaTags(await pageDOM.querySelectorAll('meta'));

            // Check if meta tag is specified.

            if (themeColorMetaTags.length === 0) {
                await context.report(resource, null, `No 'theme-color' meta tag was specified`);

                return;
            }

            /*
             * Treat the first charset meta tag as the one
             * the user intended to use, and check if it's:
             */

            const themeColorMetaTag: IAsyncHTMLElement = themeColorMetaTags[0];

            await checkNameAttributeValue(resource, themeColorMetaTag);

            // * It has a valid color value that is also supported.

            await checkContentAttributeValue(resource, themeColorMetaTag);

            // * specified in the `<body>`.

            const bodyMetaTags: Array<IAsyncHTMLElement> = getThemeColorMetaTags(await pageDOM.querySelectorAll('body meta'));

            if ((bodyMetaTags.length > 0) && bodyMetaTags[0].isSame(themeColorMetaTag)) {
                await context.report(resource, themeColorMetaTag, `Meta tag should not be specified in the '<body>'`);

                return;
            }

            // All other charset meta tags should not be included.

            if (themeColorMetaTags.length > 1) {
                const metaTags = themeColorMetaTags.slice(1);

                for (const metaTag of metaTags) {
                    await context.report(resource, metaTag, `A 'theme-color' meta tag was already specified`);
                }
            }
        };

        context.on('traverse::end', validate);
    }
}
