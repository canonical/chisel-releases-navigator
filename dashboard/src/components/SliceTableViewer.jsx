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
        <div className="u-text--muted u-text--small u-text--uppercase"
            style={{
                width: "4em", display: "inline-block", marginBottom: "1em",
                writingMode: "vertical-lr", textOrientation: "mixed", transform: "rotate(-20deg)", transformOrigin: "top right"
            }}>{value}</div>
    )

    const crc16 = function (input) {
        const data = new Uint8Array((typeof input === "string") ? [...input].map(c => c.charCodeAt(0)) : input);

        var POLY = 0x8408, INIT = 0, XOROUT = 0;
        for (var crc = INIT, i = 0; i < data.length; i++) {
            crc = crc ^ data[i];
            for (var j = 0; j < 8; j++) {
                crc = crc & 1 ? crc >>> 1 ^ POLY : crc >>> 1;
            }
        }
        return ((crc ^ XOROUT) >>> 0).toString(16).padStart(4, '0'); // Convert to hex and pad to 8 characters

    };


    const formatSlice = (name, branch, slice, index) => {
        const label = slice ? crc16(slice.raw_definition) : "";
        var color = "#FFF";

        if (slice) {
            color = "#60A982";

            if (slice.warnings.length) {
                color = "#FAD54C";
            }
        }


        const cellContent = (
            <a key={index}
                href={`https://github.com/canonical/chisel-releases/blob/${branch}/slices/${name}.yaml`}
                style={{
                    backgroundColor: color,
                    width: "4em",
                    height: "1.5em",
                    display: "inline-block",
                    borderRight: "2px solid #ddd",
                    color: "#0008",
                    cursor: "pointer", // Pointer cursor on hover
                }}
                onMouseEnter={(e) => e.currentTarget.style.filter = "brightness(1.2)"}
                onMouseLeave={(e) => e.currentTarget.style.filter = "brightness(1)"}
            >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: "100%", padding: "0 0.2em" }}>
                    <span>{label}</span>
                    {slice?.warnings.length ?
                        (<i className="bi bi-exclamation-triangle status-icon" style={{ color: "#0008" }}></i>) : ""}
                </div>
            </a>
        );

        return slice?.warnings.length ? (
            <Tooltip key={index} message={slice.warnings.map(w => "• " + w.warning).join("\n")}>
                {cellContent}
            </Tooltip>
        ) : cellContent;
    }

    // slicesWarnings
    const formatPackageHeader = (value, index) => (
        <div key={index}
            style={{
                width: "20%", float: "left", height: "1.5em", display: "inline-block"
            }}
            className="u-text--muted u-text--small u-text--uppercase" > {value}</div >
    )

    const formatPackage = (value, index) => (
        <div key={index}
            style={{
                width: "20%", 
                float: "left", 
                height: "1.5em", 
                paddingRight: "0.3em",
                borderRight: "2px solid #ddd",
                display: "inline-block",
            }}>
            <Tooltip message={value}>
                <div style={{
                    height: "1.5em",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                }}>{value}</div>
            </Tooltip>
        </div>
    )



    const select = "package, branch, definition, raw_definition, warnings";

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
                    return row ? { definition: JSON.parse(row[2]), raw_definition: row[3], warnings: JSON.parse(row[4]) } : null; // Return object with columns 2 and 3
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

    const showMoreResults = state => {

        if (state.altState)
            return state;

        let rows = state.residual_rows.splice(0, 100);
        return {
            ...state,
            htmlRows: [state.htmlRows,
            ...rows.map((row, rowIndex) => (
                <div key={rowIndex + state.htmlRows.length} style={{ display: "flex", flexWrap: "nowrap", borderBottom: "2px solid #ddd", }}>
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

            if (query_result)
                setResultsStats({ timer: endTime - startTime, count: query_result.values.length });

            resultDispatch(() => showMoreResults(initResult(query_result)));
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
                                resultDispatch((state) => showMoreResults(state));
                            }}
                            disabled={resultState.residual_rows.length <= 0}
                        >
                            Show More
                        </button>
                    </div>

                    <div className="row">
                        <div className="u-text--muted u-align-text--center">
                            Found {resultsStats.count} results in {Math.round(resultsStats.timer)} milliseconds
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
