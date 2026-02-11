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


    const [categoriesState, setCategoriesState] = useState(categories);
    const tab_list = Object.keys(categoriesState);
    const initialCategory = tab_list[0] ?? "All";
    const [category, _setCategory] = useState(getQueryObject("c", initialCategory));
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
    const [filterPanelDataState, setFilterPanelDataState] = useState(filterPanelData);
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
        const hasVersion = slice && slice.version !== null && slice.version !== undefined;
        const fullVersion = slice ? normalizeVersion(slice.version) : "";
        const label = slice ? (hasVersion ? shortenVersionForLabel(fullVersion) : "!") : "";
        const notes = slice ? slice.notes : [];
        const component = slice?.component || "";
        const repo = slice?.repo ? `, ${slice.repo}` : "";
        const section = slice?.section || "";
        const description = slice?.description || "";
        const tooltipParts = slice ? [
            `${name} @ ${branch}`,
            `${component}/${section}${repo}`,
            `${fullVersion}`,
        ] : [];
        if (description) {
            tooltipParts.push("", description);
        }
        if (notes.length) {
            tooltipParts.push("", "notes:", ...notes.map(n => `- ${n.note}`));
        }
        const tooltipMessage = tooltipParts.join("\n");
        let cellClass = "slice-cell";
        if (slice) {
            if (!hasVersion) {
                cellClass += " slice-cell--missing";
            } else if (slice.notes.length) {
                cellClass += " slice-cell--notes";
            } else {
                cellClass += " slice-cell--ok";
            }
        } else {
            cellClass += " slice-cell--empty";
        }

        // If no slice, render as a non-clickable div
        if (!slice) {
            return (
                <div key={index} className={cellClass}>
                    <div className={`slice-cell__content${hasVersion ? "" : " slice-cell__content--center"}`}>
                        <span className={`slice-cell__label${hasVersion ? "" : " slice-cell__label--center"}`}>{label}</span>
                    </div>
                </div>
            );
        }

        // If slice exists, render as a clickable link
        const cellContent = (
            <a key={index}
                href={`https://github.com/canonical/chisel-releases/blob/${branch}/slices/${name}.yaml`}
                className={`${cellClass} slice-cell--link`}
                aria-label={tooltipMessage || undefined}
            >
                <div className={`slice-cell__content${hasVersion ? "" : " slice-cell__content--center"}`}>
                    <span className={`slice-cell__label${hasVersion ? "" : " slice-cell__label--center"}`}>{label}</span>
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



    const select = "slice.package, slice.branch, slice.definition, slice.notes, slice.version, description.description, slice.component, slice.repo, slice.section";

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
                    return row
                        ? {
                              definition: JSON.parse(row[2]),
                              notes: JSON.parse(row[3]),
                              version: row[4],
                              description: row[5],
                              component: row[6],
                              repo: row[7],
                              section: row[8],
                          }
                        : null; // Return object with columns 2-8
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
            LEFT JOIN description ON description.package = slice.package
            WHERE
            search(JSON_OBJECT(${Object.keys(searchColumns).map(key => `'${key}', ${searchColumns[key].column}`).join(", ")}))
            ORDER BY
            ${order}
            `;

    const buildFilterPanelData = (branches) => {
        const branchPanel = {
            chips: branches.map(branch => ({ lead: "branch", value: branch })),
            heading: "Branch",
            id: 0,
        };
        const restPanels = filterPanelData.map((panel, index) => ({
            ...panel,
            id: index + 1,
        }));
        return [branchPanel, ...restPanels];
    };

    const buildCategories = (releases) => {
        const categoriesMap = {
            "All": () => true,
        };
        const ltsBranches = releases
            .filter(release => release.branch && release.lts)
            .map(release => release.branch);
        if (ltsBranches.length) {
            categoriesMap["LTS"] = row => ltsBranches.includes(row.branch);
        }
        const supportedBranches = releases
            .filter(release => release.branch && release.supported)
            .map(release => release.branch);
        if (supportedBranches.length) {
            categoriesMap["Supported"] = row => supportedBranches.includes(row.branch);
        }
        const develBranches = releases
            .filter(release => release.branch && release.devel)
            .map(release => release.branch);
        if (develBranches.length) {
            categoriesMap["Development"] = row => develBranches.includes(row.branch);
        }
        return categoriesMap;
    };

    const loadDb = async () => {
        // Careful with state in this async function, any state set
        // may not be readable directly after!

        if (db) // skip this step if we already have our db loaded
            return;

        const assetUrl = (file) => new URL(file, window.location.href).toString();
        const SQL = await initSqlJs({
            locateFile: (file) => assetUrl("sql-wasm.wasm"),
        });

        const response = await fetch(assetUrl("index.db.br"));
        if (!response.ok) {
            throw new Error(`Failed to fetch database: ${response.statusText}`);
        }
        const compressedBuffer = await response.arrayBuffer();

        // Decode using Brotli.js
        const decompressedBuffer = decompress(new Uint8Array(compressedBuffer));

        db = new SQL.Database(decompressedBuffer);

        // load meta data
        let queryResult, countsResult, branchesResult, releasesResult, _;
        [queryResult, _] = db.exec("SELECT * FROM meta");

        // TODO, modify query to just extract the date 
        const meta = Object.fromEntries(queryResult.values.map(row => [row[0], row[1]]));
        // setDbMeta(meta);
        let date = new Date(meta.last_update);


        [countsResult, _] = db.exec(
            "SELECT COUNT(*) AS slice_count, COUNT(DISTINCT package) AS package_count, COUNT(DISTINCT branch) AS release_count FROM slice"
        );
        const [sliceCount, packageCount, releaseCount] = countsResult?.values?.[0] ?? [0, 0, 0];

        [branchesResult, _] = db.exec("SELECT DISTINCT branch FROM slice ORDER BY branch DESC");
        const branches = branchesResult?.values?.map(row => row[0]) ?? [];
        setFilterPanelDataState(buildFilterPanelData(branches));

        [releasesResult, _] = db.exec(
            "SELECT branch, lts, supported, devel FROM release WHERE branch IS NOT NULL"
        );
        const releases = releasesResult?.values?.map(row => ({
            branch: row[0],
            lts: Boolean(row[1]),
            supported: Boolean(row[2]),
            devel: Boolean(row[3]),
        })) ?? [];
        setCategoriesState(buildCategories(releases));

        setDbStats({
            "Updated": date.toLocaleString(),
            "Packages": packageCount,
            "Slice Definition Files": sliceCount,
            "Ubuntu Releases": releaseCount
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

        const categoryFilter = categoriesState[category] ?? (() => true);
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

    useEffect(() => {
        if (!categoriesState[category]) {
            const nextCategory = Object.keys(categoriesState)[0];
            if (nextCategory) {
                setCategory(nextCategory);
            }
        }
    }, [categoriesState, category]);

    return (
        <div>

            <div style={{ display: "flex" }}>
                <div style={{ flex: "1 1 auto" }}>

                    <SearchAndFilter
                        existingSearchData={searchTerm}
                        filterPanelData={filterPanelDataState}
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
                    <div className="release-header-row">
                        {resultState.htmlHeading}
                    </div>
                    {resultState.htmlRows}
                    <div className="row text-center show-all-row">
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
