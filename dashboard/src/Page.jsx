import React, { useEffect, useMemo, useState } from 'react';
import Navigation from '@canonical/react-components/dist/components/Navigation';
import List from '@canonical/react-components/dist/components/List';
import Row from '@canonical/react-components/dist/components/Row';
import Strip from '@canonical/react-components/dist/components/Strip';
import { PromoTab } from './components/PromoTab';

// TODO: split this into a separate files per component
import './style.scss';
// vendored from twbs/icons (bootstrap-icons) sun.svg, MIT.
// upstream: https://github.com/twbs/icons/blob/main/icons/sun.svg
// license: LICENSE-bootstrap-icons at repo root
const SunIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M8 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6m0 1a4 4 0 1 0 0-8 4 4 0 0 0 0 8M8 0a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 0m0 13a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 13m8-5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2a.5.5 0 0 1 .5.5M3 8a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2A.5.5 0 0 1 3 8m10.657-5.657a.5.5 0 0 1 0 .707l-1.414 1.415a.5.5 0 1 1-.707-.708l1.414-1.414a.5.5 0 0 1 .707 0m-9.193 9.193a.5.5 0 0 1 0 .707L3.05 13.657a.5.5 0 0 1-.707-.707l1.414-1.414a.5.5 0 0 1 .707 0m9.193 2.121a.5.5 0 0 1-.707 0l-1.414-1.414a.5.5 0 0 1 .707-.707l1.414 1.414a.5.5 0 0 1 0 .707M4.464 4.465a.5.5 0 0 1-.707 0L2.343 3.05a.5.5 0 1 1 .707-.707l1.414 1.414a.5.5 0 0 1 0 .708" />
    </svg>
);
// vendored from twbs/icons (bootstrap-icons) moon-stars.svg, MIT.
// upstream: https://github.com/twbs/icons/blob/main/icons/moon-stars.svg
// license: LICENSE-bootstrap-icons at repo root
const MoonStarsIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M6 .278a.77.77 0 0 1 .08.858 7.2 7.2 0 0 0-.878 3.46c0 4.021 3.278 7.277 7.318 7.277q.792-.001 1.533-.16a.79.79 0 0 1 .81.316.73.73 0 0 1-.031.893A8.35 8.35 0 0 1 8.344 16C3.734 16 0 12.286 0 7.71 0 4.266 2.114 1.312 5.124.06A.75.75 0 0 1 6 .278M4.858 1.311A7.27 7.27 0 0 0 1.025 7.71c0 4.02 3.279 7.276 7.319 7.276a7.32 7.32 0 0 0 5.205-2.162q-.506.063-1.029.063c-4.61 0-8.343-3.714-8.343-8.29 0-1.167.242-2.278.681-3.286" />
        <path d="M10.794 3.148a.217.217 0 0 1 .412 0l.387 1.162c.173.518.579.924 1.097 1.097l1.162.387a.217.217 0 0 1 0 .412l-1.162.387a1.73 1.73 0 0 0-1.097 1.097l-.387 1.162a.217.217 0 0 1-.412 0l-.387-1.162A1.73 1.73 0 0 0 9.31 6.593l-1.162-.387a.217.217 0 0 1 0-.412l1.162-.387a1.73 1.73 0 0 0 1.097-1.097zM13.863.099a.145.145 0 0 1 .274 0l.258.774c.115.346.386.617.732.732l.774.258a.145.145 0 0 1 0 .274l-.774.258a1.16 1.16 0 0 0-.732.732l-.258.774a.145.145 0 0 1-.274 0l-.258-.774a1.16 1.16 0 0 0-.732-.732l-.774-.258a.145.145 0 0 1 0-.274l.774-.258c.346-.115.617-.386.732-.732z" />
    </svg>
);

const Page = ({ rootContent }) => {
    const systemQuery = useMemo(
        () => window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)"),
        []
    );
    const [theme, setTheme] = useState(() => {
        const stored = window.localStorage.getItem("theme-override");
        if (stored === "dark" || stored === "light") {
            return stored;
        }
        return systemQuery?.matches ? "dark" : "light";
    });

    useEffect(() => {
        const stored = window.localStorage.getItem("theme-override");
        if (stored === "dark" || stored === "light") {
            return;
        }
        if (!systemQuery) {
            return;
        }
        const handler = (event) => {
            setTheme(event.matches ? "dark" : "light");
        };
        systemQuery.addEventListener("change", handler);
        return () => systemQuery.removeEventListener("change", handler);
    }, [systemQuery]);

    useEffect(() => {
        document.documentElement.setAttribute("data-theme", theme);
    }, [theme]);

    const toggleTheme = () => {
        const nextTheme = theme === "dark" ? "light" : "dark";
        window.localStorage.setItem("theme-override", nextTheme);
        setTheme(nextTheme);
    };

    const helpItems = [
        { label: 'Repository', url: 'https://github.com/canonical/chisel-release-navigator/' },
        { label: 'Issues', url: 'https://github.com/canonical/chisel-release-navigator/issues' },
    ];

    return (
        <div className="l-site">
            <button
                type="button"
                className="theme-toggle"
                aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
                onClick={toggleTheme}
                title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            >
                {theme === "dark" ? <SunIcon /> : <MoonStarsIcon />}
            </button>
            <Navigation
                theme="dark"
                logo={{ src: 'https://assets.ubuntu.com/v1/82818827-CoF_white.svg', title: 'Chisel Releases Navigator', url: '#' }}
            />

            <Strip>
                <Row>
                    <div id="root">{rootContent}</div>
                </Row>
            </Strip>

            <div className="l-footer--sticky p-strip--dark">
                <nav aria-label="Footer">
                    <Row>
                        <div className="col-12">
                            Chisel Releases Navigator &copy; {new Date().getFullYear()} Canonical Ltd.
                        </div>
                    </Row>
                    <Row>
                        <div className="col-12">
                            <List
                                items={helpItems.map(item => (
                                    <a href={item.url}><small>{item.label}</small></a>
                                ))}
                                middot
                            />
                            <div id="sub-footer" className="p-muted-text"></div>
                        </div>
                    </Row>
                </nav>
            </div>

            <PromoTab
                name="Feedback"
                iconClass="p-icon--user is-dark"
                link="https://github.com/canonical/chisel-release-navigator/issues/new?template=feedback.md"
            />
        </div>
    );
};

export default Page;
