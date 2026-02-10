import React, { useEffect, useState, useReducer } from "react";
import initSqlJs from 'sql.js';
import { ContextualMenu, SearchAndFilter, Tabs, Button, Tooltip } from '@canonical/react-components';
var decompress = require('brotli/decompress');


import { SubFooter } from './SubFooter';
import { setQueryObject, getQueryObject } from '../utils';
let db;

// TODO: properly align these empty states to center
const LoadingState = () => (
    <div className="u-align--center">
        <h2><i className="p-icon--spinner u-animation--spin" style={{ height: "0.75em", width: "0.75em" }}></i> Loading Index...</h2>
    </div>
);

const NoResultsState = () => (<>

    <div className="row">
        <div className="u-align--right col-3 empty-state-icon u-hide--medium">
            <i className="p-icon--search" style={{ height: "3rem", width: "3rem" }}></i>
        </div>
        <div className="u-align--left col-9">
            <p className="p-heading--4 u-no-padding--top">No Slices Found</p>
            <p>Your search did not match any slice definition. Try adjusting your keywords or
                loosening search requirements.</p>
        </div>
    </div>

</>);

const SliceTableViewer = ({
    viewTable,
    filterPanelData,
    contextMenuLinks,
    categories,
    orderByConfig,
    searchColumns,
    searchLogic,
}) => {


    const tab_list = Object.keys(categories);
    const [category, _setCategory] = useState(getQueryObject("c", tab_list[0]));
    // wrap certain states such that we can store and recover values from query string
    const setCategory = val => {
        setQueryObject("c", val)
        return _setCategory(val);
    }
    const [searchTerm, _setSearchTerm] = useState(getQueryObject("s", []));
    const setSearchTerm = val => {
        setQueryObject("s", val)
        return _setSearchTerm(val);
    }
    const [orderBy, _setOrderBy] = useState(getQueryObject("o", orderByConfig[0].value));
    const setOrderBy = val => {
        setQueryObject("o", val)
        return _setOrderBy(val);
    }
    const [resultsStats, setResultsStats] = useState();
    const [dbStats, setDbStats] = useState({});
    // const [dbMeta, setDbMeta] = useState({});

    const resultReducer = (state, state_func) => {
        state = state_func(state)
        return state;
    }

    const formatReleaseHeader = (value, index) => (
        <div className="u-text--muted u-text--small u-text--uppercase release-header">{value}</div>
    )

    const normalizeVersion = (version) => (version === null || version === undefined ? "null" : String(version));
    const shortenVersionForLabel = (version) => {
        var trimmed = version.split("ubuntu")[0];
        trimmed = trimmed.split("build")[0];
        trimmed = trimmed.split("-")[0];
        trimmed = trimmed.split("+")[0];
        trimmed = trimmed.split("~")[0];
        // trim everything *before* the first colon, if it exists (to remove epoch)
        if (trimmed.includes(":")) {
            trimmed = trimmed.split(":").slice(1).join(":");
        }
        return trimmed;        
    }

    const formatSlice = (name, branch, slice, index) => {
        const fullVersion = slice ? normalizeVersion(slice.version) : "";
        const label = slice ? shortenVersionForLabel(fullVersion) : "";
            const notes = slice ? slice.notes : [];
            const tooltipParts = slice ? [
                `${name}@${branch} (<component>/<repo>)`,
                `${fullVersion}`,
                "",
                "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
            ] : [];
            if (notes.length) {
                tooltipParts.push("", "Notes:", ...notes.map(n => `- ${n.note}`));
            }
            const tooltipMessage = tooltipParts.join("\n");
        var color = "#FFF";

        if (slice) {
            if (slice.version === null || slice.version === undefined) {
                color = "#E94B4B";
            } else if (slice.notes.length) {
                color = "#60a2a9";
            } else {
                color = "#60A982";
            }
        }

        const cellStyle = {
            backgroundColor: color,
        };

        // If no slice, render as a non-clickable div
        if (!slice) {
            return (
                <div key={index} className="slice-cell" style={cellStyle}>
                    <div className="slice-cell__content">
                        <span className="slice-cell__label">{label}</span>
                    </div>
                </div>
            );
        }

        // If slice exists, render as a clickable link
        const cellContent = (
            <a key={index}
                href={`https://github.com/canonical/chisel-releases/blob/${branch}/slices/${name}.yaml`}
                className="slice-cell"
                aria-label={tooltipMessage || undefined}
                style={{
                    ...cellStyle,
                    cursor: "pointer",
                }}
            >
                <div className="slice-cell__content">
                    <span className="slice-cell__label">{label}</span>
                </div>
                {slice?.notes.length ? (
                    <span
                        aria-hidden="true"
                        className="slice-cell__notch"
                    />
                ) : ""}
                {tooltipMessage ? (
                    <span className="slice-tooltip" aria-hidden="true">
                        {tooltipMessage}
                    </span>
                ) : ""}
            </a>
        );

        return cellContent;
    }

    // slicesNotes
    const formatPackageHeader = (value, index) => (
        <div key={index} className="u-text--muted u-text--small u-text--uppercase package-header"> {value}</div >
    )

    const formatPackage = (value, index) => (
        <div key={index} className="package-cell">
            <Tooltip message={value}>
                <div className="package-cell__text">{value}</div>
            </Tooltip>
        </div>
    )



    const select = "package, branch, definition, notes, version";

    const initResult = queryResult => {

        if (queryResult === undefined) {
            return {
                altState: (<NoResultsState />)
            }
        }

        const releases = [...new Set(queryResult.values.map(row => row[1]))].sort(); // Sort releases
        const packages = [...new Set(queryResult.values.map(row => row[0]))]; // Unique package names
        const matrix = packages.map(pkg =>
            [pkg, ...releases.map(rel => {
                const row = queryResult.values.find(row => row[0] === pkg && row[1] === rel);
                try {
                    return row ? { definition: JSON.parse(row[2]), notes: JSON.parse(row[3]), version: row[4] } : null; // Return object with columns 2-4
                } catch (e) {
                    return null;
                }
            })]
        );

        let columns = ["Package", ...releases],
            values = matrix;

        return {
            altState: null,
            columns: columns,
            values: values,
            residual_rows: matrix,
            htmlRows: [],
            htmlHeading: [
                formatPackageHeader(columns[0], 0),
                ...columns.slice(1).map((key, keyIndex) => formatReleaseHeader(key, keyIndex + 1))
            ]
        }
    }

    const showInitialResults = state => {

        if (state.altState)
            return state;

        let rows = state.residual_rows.splice(0, 100);
        return {
            ...state,
            htmlRows: [state.htmlRows,
            ...rows.map((row, rowIndex) => (
                <div key={rowIndex + state.htmlRows.length} className="slice-row">
                    {formatPackage(row[0], 0)}
                    {row.slice(1).map((value, colIndex) => formatSlice(row[0], state.columns[colIndex + 1], value, colIndex + 1))}
                </div>
            ))
            ]
        }
    }

    const showAllResults = state => {

        if (state.altState)
            return state;

        let rows = state.residual_rows.splice(0, state.residual_rows.length);
        return {
            ...state,
            htmlRows: [state.htmlRows,
            ...rows.map((row, rowIndex) => (
                <div key={rowIndex + state.htmlRows.length} className="slice-row">
                    {formatPackage(row[0], 0)}
                    {row.slice(1).map((value, colIndex) => formatSlice(row[0], state.columns[colIndex + 1], value, colIndex + 1))}
                </div>
            ))
            ]
        }
    }

    const [resultState, resultDispatch] = useReducer(resultReducer, { altState: (<LoadingState />) });

    const generateSearchFunction = (keywordArray, groupedData, categoryFilter) => {
        return (rowJSON) => {
            const row = JSON.parse(rowJSON);
            Object.keys(searchColumns).forEach(key => {
                if (searchColumns[key].parser) {
                    row[key] = searchColumns[key].parser(row[key]);
                }
            });
            return categoryFilter(row) && searchLogic(row, keywordArray, groupedData);
        }
    };

    const createQueryTemplate = (table, select, order) => `
            SELECT ${select}
            FROM ${table}
            WHERE
            search(JSON_OBJECT(${Object.keys(searchColumns).map(key => `'${key}', ${searchColumns[key].column}`).join(", ")}))
            ORDER BY
            ${order}
            `;

    const loadDb = async () => {
        // Careful with state in this async function, any state set
        // may not be readable directly after!

        if (db) // skip this step if we already have our db loaded
            return;

        const SQL = await initSqlJs({
            locateFile: (file) => `/sql-wasm.wasm`,
        });

        const response = await fetch('/index.db.br');
        if (!response.ok) {
            throw new Error(`Failed to fetch database: ${response.statusText}`);
        }
        const compressedBuffer = await response.arrayBuffer();

        // Decode using Brotli.js
        const decompressedBuffer = decompress(new Uint8Array(compressedBuffer));

        db = new SQL.Database(decompressedBuffer);

        // load meta data
        let queryResult, _, imgCount, digestCount;
        [queryResult, _] = db.exec("SELECT * FROM meta");

        // TODO, modify query to just extract the date 
        const meta = Object.fromEntries(queryResult.values.map(row => [row[1], row[2]]));
        // setDbMeta(meta);
        let date = new Date(meta.last_update);


        // TODO: Complete these queries
        // [queryResult, _] = db.exec("SELECT max(RowID) FROM repository");
        // imgCount = queryResult.values[0];
        imgCount = 0;

        // [queryResult, _] = db.exec("SELECT max(RowID) FROM digest");
        // digestCount = queryResult.values[0];
        digestCount = 0;

        setDbStats({
            "Updated": date.toLocaleString(),
            "Images": imgCount,
            "Digests": digestCount
        });
    }

    const queryDB = (select, searchData, category, order) => {

        const keywordArray = searchData
            .filter(item => "quoteValue" in item)
            .map(item => item.value.trim());

        const groupedData = searchData
            .filter(item => "lead" in item)
            .reduce(
                (acc, item) => {
                    if (!acc[item.lead])
                        acc[item.lead] = [];

                    acc[item.lead].push(item.value);
                    return acc;
                }, {});

        const categoryFilter = categories[category];
        const search = generateSearchFunction(keywordArray, groupedData, categoryFilter);
        db.create_function("search", search);
        const query = createQueryTemplate(viewTable, select, order);
        const [queryResult, _] = db.exec(query);

        return queryResult;
    }

    useEffect(() => {
        loadDb().then(() => {

            const startTime = performance.now()
            let query_result = queryDB(select, searchTerm, category, orderBy);
            const endTime = performance.now()

            if (query_result) {
                const packageCount = [...new Set(query_result.values.map(row => row[0]))].length;
                setResultsStats({ timer: endTime - startTime, count: query_result.values.length, packages: packageCount });
            }

            resultDispatch(() => showInitialResults(initResult(query_result)));
        });
    }, [category, searchTerm, orderBy]);

    return (
        <div>

            <div style={{ display: "flex" }}>
                <div style={{ flex: "1 1 auto" }}>

                    <SearchAndFilter
                        existingSearchData={searchTerm}
                        filterPanelData={filterPanelData}
                        returnSearchData={setSearchTerm}
                    />

                </div>
                <div style={{ flex: "0 0 auto", whiteSpace: "nowrap" }}>
                    <ContextualMenu
                        className={'u-no-margin'}
                        toggleAppearance="base"
                        links={[
                            // {
                            //     children: <hr />
                            // },
                            ...orderByConfig.map((config) => ({
                                children: orderBy === config.value ? <strong>{config.name}</strong> : config.name,
                                onClick: () => setOrderBy(config.value),
                                disabled: orderByConfig.length == 1
                            })),
                            ...contextMenuLinks
                        ]}
                        position="right"
                        toggleLabel="⋮"
                    />
                </div>

            </div>

            <Tabs
                links={tab_list.map((tab) => ({
                    active: category == tab,
                    onClick: (event) => setCategory(tab),
                    label: tab
                }))}
            />

            {resultState.altState ? (
                resultState.altState
            ) : (
                <>
                    <div>
                        {resultState.htmlHeading}
                    </div>
                    {resultState.htmlRows}
                    <div className="row text-center">
                        <button
                            className="p-button"
                            onClick={() => {
                                resultDispatch((state) => showAllResults(state));
                            }}
                            disabled={resultState.residual_rows.length <= 0}
                        >
                            Show All
                        </button>
                    </div>

                    <div className="row">
                        <div className="u-text--muted u-align-text--center">
                            Found {resultsStats.packages} packages ({resultsStats.count} results) in {Math.round(resultsStats.timer)} milliseconds
                        </div>
                    </div>
                </>
            )
            }
            <SubFooter stats={dbStats} />
        </div >
    );
};

export { SliceTableViewer };
