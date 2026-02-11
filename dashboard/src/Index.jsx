import React from "react";
import ReactDOM from "react-dom/client";
import { SliceTableViewer } from "./components/SliceTableViewer";
import Page from "./Page";


const filterPanelData = [
    {
        chips: [
            { lead: 'notes', value: true },
            { lead: 'notes', value: "double glob" },
            { lead: 'notes', value: "architecture comments" },
            { lead: 'notes', value: "large comments" },
            { lead: 'notes', value: "fixed minor versions" },
            { lead: 'notes', value: "missing copyright" },
            { lead: 'notes', value: "unsorted content" },
            { lead: 'version', value: "missing" }
        ],
        heading: 'Notes',
        id: 0
    }
];

const contextMenuLinks = [];

const viewTable = "slice";

const categories = {};

const orderByConfig = [
    { name: "Name A-Z", value: "slice.package ASC" },
    { name: "Name Z-A", value: "slice.package DESC" },
]


const searchColumns = {
    "branch": { column: "slice.branch" },
    "package": { column: "slice.package" },
    "notes": { column: "slice.notes" },
    "version": { column: "slice.version" },
};

const searchLogic = (row, keywordArray, groupedData) => {

    const searchText = `${row.branch} ${row.package}`.toLowerCase(); // TODO: move to row in default view
    const keywordFound = keywordArray.every(keyword => searchText.includes(keyword.toLowerCase()));
    const branchFound = groupedData.branch ? groupedData.branch.some(filter => row.branch == filter) : true;

    // This is ugly fix it later, if the note string has more than 2 characters there is at least one item
    const notesFound = groupedData.notes ? groupedData.notes.some(
        filter => (row.notes.length > 2) && filter
    ) : true;

    const versionFound = groupedData.version ? groupedData.version.some(
        filter => (filter === "missing" ? row.version === null || row.version === undefined : row.version === filter)
    ) : true;

    return keywordFound && branchFound && notesFound && versionFound;

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
                        The Chisel Releases Navigator helps to explore and analyze the contents of&nbsp;
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
