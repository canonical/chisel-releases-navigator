import React from "react";
import ReactDOM from "react-dom/client";
import { SliceTableViewer } from "./components/SliceTableViewer";
import Page from "./Page";


const filterPanelData = [
    {
        chips: [
            { lead: 'branch', value: 'ubuntu-24.04' },
            { lead: 'branch', value: 'ubuntu-23.10' },
            { lead: 'branch', value: 'ubuntu-23.04' },
            { lead: 'branch', value: 'ubuntu-22.10' },
            { lead: 'branch', value: 'ubuntu-22.04' },
            { lead: 'branch', value: 'ubuntu-20.04' }
        ],
        heading: 'Release',
        id: 0
    },
    {
        chips: [
            { lead: 'warnings', value: true },
            { lead: 'warnings', value: "double glob" },
            { lead: 'warnings', value: "architecture comments" },
            { lead: 'warnings', value: "large comments" },
            { lead: 'warnings', value: "fixed minor versions" },
            { lead: 'warnings', value: "missing copyright" },
            { lead: 'warnings', value: "unsorted content" }
        ],
        heading: 'Warnings',
        id: 1
    }
];

const contextMenuLinks = [];

const viewTable = "slice";

const categories = {
    "All": (row) => true,
    "LTS": (row) => ["ubuntu-26.04", "ubuntu-24.04", "ubuntu-22.04", "ubuntu-20.04"].includes(row.branch),
    "Active Release": (row) => ["ubuntu-26.04", "ubuntu-25.10", "ubuntu-24.04", "ubuntu-22.04", "ubuntu-20.04"].includes(row.branch),
};


const orderByConfig = [
    { name: "Name A-Z", value: "package ASC" },
    { name: "Name Z-A", value: "package DESC" },
]


const searchColumns = {
    "branch": { column: "slice.branch" },
    "package": { column: "slice.package" },
    "warnings": { column: "slice.warnings" },
    // "type": { column: "slice.type" }
};

const searchLogic = (row, keywordArray, groupedData) => {

    const searchText = `${row.branch} ${row.package} ${row.type}`.toLowerCase(); // TODO: move to row in default view
    const keywordFound = keywordArray.every(keyword => searchText.includes(keyword.toLowerCase()));
    const branchFound = groupedData.branch ? groupedData.branch.some ^ (filter => row.branch == filter) : true;
    const typeFound = groupedData.type ? groupedData.type.some(filter => row.type == filter) : true;

    // This is ugly fix it later, if the warning string has more than 2 characters there is at least one item
    const warningsFound = groupedData.warnings ? groupedData.warnings.some(
        filter => (row.warnings.length > 2) && filter
    ) : true;

    return keywordFound && branchFound && typeFound && warningsFound;

};


const Index = () => (
    <Page rootContent={
        <>
            <div className="row">
                <div className="col-12">
                    <h2>Chisel Releases Navigator</h2>
                </div>
                <div className="col-12">
                    <p className="u-no-max-width">
                        The Chisel Releases Navigator helps to explore and analyze the contents of 
                        <a href="https://www.github.com/canonical/chisel-releases" target="_blank" rel="noreferrer">chisel-releases</a> repo.
                        It provides an interactive table view of the release slices, along with filtering and searching.

                    </p>
                </div>
            </div>

            <div className="row">
                <div className="col-12">
                    <SliceTableViewer
                        filterPanelData={filterPanelData}
                        contextMenuLinks={contextMenuLinks}
                        searchColumns={searchColumns}
                        viewTable={viewTable}
                        categories={categories}
                        orderByConfig={orderByConfig}
                        searchLogic={searchLogic}
                    />
                </div>
            </div>
        </>
    } />
);

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<Index />);
