import React, { useEffect, useRef } from 'react';
import { EmailVerificationBanner } from './EmailVerificationBanner';
import { PollBanner } from './PollBanner';
import styles from './BannerStack.module.css';

/**
 * Single home for system-level banners (email verification, polls).
 * Renders as `position: fixed` directly below the Layout header so
 * banners are never hidden behind a page's own fixed top bar (navPill,
 * adminFixedTopBar, dayHeaderFixed, etc).
 *
 * The stack measures itself via ResizeObserver and writes its height to
 * the `--banner-stack-height` CSS variable on `<html>`. Every fixed top
 * bar in the app reads this variable and shifts its `top:` down by the
 * banner stack's height — no page-by-page coordination required.
 *
 * Pending trip invites do NOT live here — they're surfaced as items in
 * the HamburgerDrawer's notification list (with a count badge on the
 * menu icon) so they don't push every page's chrome down. See
 * HamburgerDrawer.tsx.
 *
 * If you add a new banner type that should always be visible, drop it
 * inside this component. If you add a new fixed top bar on a page, add
 * `var(--banner-stack-height, 0px)` to its `top:` and to the surrounding
 * wrapper's `padding-top:`.
 */
export const BannerStack: React.FC = () => {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const root = document.documentElement;

        const update = () => {
            const h = el.offsetHeight;
            root.style.setProperty('--banner-stack-height', `${h}px`);
        };

        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);

        return () => {
            ro.disconnect();
            // Reset so a remounted Layout doesn't inherit a stale offset.
            root.style.setProperty('--banner-stack-height', '0px');
        };
    }, []);

    return (
        <div ref={ref} className={styles.stack} data-banner-stack>
            <EmailVerificationBanner />
            <PollBanner />
        </div>
    );
};
