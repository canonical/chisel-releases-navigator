import React, { useEffect, useMemo, useState } from 'react';
import { Navigation, List, Row, Strip } from '@canonical/react-components';
import { PromoTab } from './components/PromoTab';

// TODO: split this into a separate files per component
import './style.scss';
import 'bootstrap-icons/font/bootstrap-icons.css';

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
                <i className={`bi ${theme === "dark" ? "bi-sun" : "bi-moon-stars"}`} aria-hidden="true"></i>
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
