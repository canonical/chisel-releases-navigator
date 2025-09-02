const setQueryObject = (key, obj) => {
    const params = new URLSearchParams(window.location.search);
    params.set(key, btoa(JSON.stringify(obj)));
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
    return obj;
};

const getQueryObject = (key, defaultObj) => {
    const params = new URLSearchParams(window.location.search);
    const value = params.get(key);
    try {
        return value ? JSON.parse(atob(value)) : setQueryObject(key, defaultObj);
    } catch (e) {
        return;
    }
};

function formatQueryString(url, key, obj) {
    const params = new URLSearchParams();
    params.set(key, btoa(JSON.stringify(obj)));
    const queryString = params.toString();
    return url.includes('?') ? `${url}&${queryString}` : `${url}?${queryString}`;
}

export { setQueryObject, getQueryObject, formatQueryString };