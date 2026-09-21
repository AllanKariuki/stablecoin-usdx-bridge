import React from 'react';
import MainLayout from '../layouts/MainLayout';
import MapLayout from '../layouts/MapLayout';

interface LayoutWrapperProps {
    children: React.ReactNode;
    layout: 'main' | 'map' | 'none';
}

const LayoutWrapper: React.FC<LayoutWrapperProps> = ({ children, layout }) => {

    switch (layout) {
        case 'main':
            return <MainLayout>{children}</MainLayout>;
        case 'map':
            return <MapLayout>{children}</MapLayout>;
        case 'none':
        default:
            return <>{children}</>;
    }
};

export default LayoutWrapper;
