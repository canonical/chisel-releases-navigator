import React from 'react';
import { Navigation, List, Row, Strip } from '@canonical/react-components';
import { PromoTab } from './components/PromoTab';

// TODO: split this into a separate files per component
import './style.scss';
import 'bootstrap-icons/font/bootstrap-icons.css';

const Page = ({ rootContent }) => {

    const helpItems = [
        { label: 'Repository', url: 'https://github.com/canonical/chisel-release-navigator/' },
        { label: 'Issues', url: 'https://github.com/canonical/chisel-release-navigator/issues' },
    ];

    return (
        <div className="l-site">
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
                            OCI-Dashboard
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
