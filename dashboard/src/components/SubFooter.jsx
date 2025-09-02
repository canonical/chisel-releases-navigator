import { createPortal } from "react-dom";
import { List } from '@canonical/react-components';
import React from "react";


const SubFooter = ({ stats }) => {
    if (Object.keys(stats).length == 0)
        return
    const stats_list = Object.entries(stats).map(([key, value]) => `${key}: ${value}`);
    return createPortal(
        <List className="sub-footer-db-stats" items={stats_list} middot />,
        document.getElementById("sub-footer")
    );
};


export { SubFooter };
