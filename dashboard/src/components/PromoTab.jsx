import React, { useRef } from 'react';

const PromoTab = ({ name, iconClass, link }) => {
    const feedbackTabRef = useRef(null);

    const interval = setInterval(() => {
        feedbackTabRef.current.classList.add('hover');
        setTimeout(() => {
            feedbackTabRef.current.classList.remove('hover');
        }, 300); // ms, jump duration
    }, 5 * 60 * 1000); //ms,  jump interval

    return (
        <>
            <button ref={feedbackTabRef} className="p-button--brand promo-tab" onClick={() => window.open(link)}>
                <span>{name}</span>
                <i className={iconClass}></i>
            </button>
        </>
    );
};

export { PromoTab };
