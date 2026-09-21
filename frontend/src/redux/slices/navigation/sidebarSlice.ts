import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import { menuPayload, type MenuItem, type SidebarState } from '../../../types/navigation/sidebar';
import { get } from '../../../api';

const MENU_CACHE_KEY = 'sidebar_menu_items';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

const initialState: SidebarState = {
    menuItems: [],
    loading: false,
    error: null,
    activeItemId: '',
    isCollapsed: false,
};

// Helper function to get cached menu items
const getCachedMenuItems = (): MenuItem[] | null => {
    try {
        const cached = localStorage.getItem(MENU_CACHE_KEY);
        if (cached) {
            const { data, timestamp } = JSON.parse(cached);
            if (Date.now() - timestamp < CACHE_DURATION) {
                return data as MenuItem[];
            }
        }
    } catch (error) {
        console.warn('Failed to parse cached manu items: ', error);
    }
    return null;
}

const setCachedMenuItems = (items: MenuItem[]) => {
    try {
        localStorage.setItem(MENU_CACHE_KEY, JSON.stringify({
            data: items,
            timestamp: Date.now()
        }));
    } catch (error) {
        console.warn('Failed to cache menu items:', error);
    }
};

// Async thunk for fetching the menu items
export const fetchMenuItems = createAsyncThunk(
    'sidebar/fetchMenuItems',
    async () => {
        const cachedItems = getCachedMenuItems();
        if (cachedItems) {
            return cachedItems;
        }
        try {
            const response = await get('/menu-items');
            setCachedMenuItems(response as MenuItem[]);
            return response as MenuItem[];
        } catch (error) {
            console.log('An error occured while fetching menu items', error);
            return menuPayload;
        }
    }
);

const sidebarSlice = createSlice({
    name: 'sidebar',
    initialState,
    reducers: {
        setActiveItemId: (state, action: PayloadAction<string>) => {
            state.activeItemId = action.payload;
        },
        toggleCollapse: (state) => {
            state.isCollapsed = !state.isCollapsed;
        },
        setCollapsed: (state, action: PayloadAction<boolean>) => {
            state.isCollapsed = action.payload;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchMenuItems.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(fetchMenuItems.fulfilled, (state, action) => {
                state.loading = false;
                state.menuItems = action.payload;
            })
            .addCase(fetchMenuItems.rejected, (state, action) => {
                state.loading = false;
                state.error = action.error.message || 'Failed to fetch menu items';
            });
    },
});

// export selectors
export const selectMenuItems = (state: { sidebar: SidebarState }) => state.sidebar.menuItems;
export const selectActiveItemId = (state: { sidebar: SidebarState }) => state.sidebar.activeItemId;
export const selectCollapse = (state: { sidebar: SidebarState }) => state.sidebar.isCollapsed;
export const selectSidebarError = (state: { sidebar: SidebarState }) => state.sidebar.error;
export const selectSidebarLoading = (state: { sidebar: SidebarState}) => state.sidebar.loading;


export const { setActiveItemId, toggleCollapse, setCollapsed } = sidebarSlice.actions;
export default sidebarSlice.reducer;
