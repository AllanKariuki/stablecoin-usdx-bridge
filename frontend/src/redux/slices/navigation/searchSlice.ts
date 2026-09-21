import { createSlice, type PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import { type SearchState, type SearchResult, mockSearchResponses } from '../../../types/navigation/search';
import { menuPayload } from '../../../types/navigation/sidebar';
import { get } from '../../../api';

const initialState: SearchState = {
    query: '',
    results: [],
    isloading: false,
    error: null,
    recentSearches: [],
    isOpen: false,
    selectedResult: null
}

// Helper function to find route from menuPayload based on search type
const findRouteByType = (searchType: string, subCategory?: string): string => {
    const typeToParentMap: Record<string, string> = {
        'aircraft': 'fleet-management',
        'flight': 'dispatch-operations',
        'maintenance': 'fleet-management',
        'user': 'resource-management',
        'crew': 'resource-management',
        'settings': 'settings',
        'weather': 'monitoring',
        'alerts': 'notifications',
        'reports': 'reports'
    };

    const parentKey = typeToParentMap[searchType];
    const parentMenu = menuPayload.find(menu => menu.id === parentKey);

    if (parentMenu?.children) {
        // try to find specific sub-category first
        if (subCategory) {
            const specificChild = parentMenu.children.find(child => 
                child.id.includes(subCategory) || child.label.toLowerCase().includes(subCategory.toLowerCase())
            );
            if (specificChild) return specificChild.path ?? '';
        }

        // fallback to first relevant child or first child
        const relevantChild = parentMenu.children.find(child => {
            if (searchType === 'aircraft') return child.id === 'aircraft-registry';
            if (searchType === 'flight') return child.id === 'flights';
            if (searchType === 'maintenance') return child.id === 'aircraft-maintenance';
            if (searchType === 'user' || searchType === 'crew') return child.id === 'crew-roster';
            if (searchType === 'settings') return child.id === 'settings';
            return true;
        });

        return relevantChild?.path || parentMenu.children[0]?.path || '/';
    }
    return '/';
}

const transformSearchResult = (data: any[], searchType: string): SearchResult[] => {
    return data.map((item: any) => {
        const route = findRouteByType(searchType, item.category || item.subCategory);
        return {
            id: item.id || `${searchType}-${Date.now()}-${Math.random()}`,
            type: searchType as any,
            title: item.title || item.name || item.flight_number || item.aircraft_registration || item.registration_number,
            subtitle: item.subtitle || item.airline || item.location || item.type || item.manufacturer,
            details: item.details || item.description || item.status || item.aircraft_status,
            route: route,
            metadata: item.metadata || item,
            icon: item.icon,
            items: item.items?.map((subItem: any) => ({
                title: subItem.title || subItem.name,
                details: subItem.details || subItem.description,
                route: findRouteByType(searchType, subItem.category || subItem.subType)
            }))
        };
    });
};

// Simplified to only accept query string
export const performSearch = createAsyncThunk(
    'search/performSearch',
    async (query: string) => {
        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 300));

        // Global search across all types - let the data determine the type
        const allResults: any[] = [];
        Object.entries(mockSearchResponses).forEach(([searchType, data]) => {
            const filteredData = (data as any[]).filter((item: any) => {
                const searchableFields = [
                    item.title,
                    item.subtitle,
                    item.details,
                    item.name,
                    item.flight_number,
                    item.aircraft_registration,
                    item.registration_number,
                    item.manufacturer,
                    item.model,
                    item.owner,
                    item.operator,
                    item.airline,
                    item.status,
                    item.aircraft_status,
                    item.role,
                    item.category
                ].filter(Boolean); // Remove null/undefined values
                
                return searchableFields.some(field => 
                    field && field.toString().toLowerCase().includes(query.toLowerCase())
                );
            });
            
            if (filteredData.length > 0) {
                allResults.push(...transformSearchResult(filteredData, searchType));
            }
        });
        
        return allResults;
    }
)

export const performApiSearch = createAsyncThunk(
    'search/performApiSearch',
    async (query: string) => {
        try {
            if (!query.trim()) {
                return [];
            }

            const response: any = await get(`/global-search?query=${query}`);
            
            // The API response should contain the type information in each result
            // Transform the results while preserving the type from the payload
            const transformedResults = response.results.map((item: any) => ({
                id: item.id || `api-${Date.now()}-${Math.random()}`,
                type: item.type, // Type comes from the API response
                title: item.title,
                subtitle: item.subtitle,
                details: item.details,
                route: item.route || findRouteByType(item.type, item.category),
                metadata: item.metadata || {},
                icon: item.icon,
                items: item.items
            }));

            return transformedResults;
        } catch (error: any) {
                return error.message || 'Search failed';
        }
    }
)

export const searchFlights = createAsyncThunk(
    'search/searchFlights',
    async (query: string ) => {
        try {
            if (!query.trim()) {
                return [];
            }

            // Try API first
            const response: any = await get(`/flight?q=${query}`);
            
            // Transform API response to SearchResult format
            const transformedResults = response.data.map((flight: any) => ({
                id: flight.flightId || flight.id || `flight-${Date.now()}-${Math.random()}`,
                type: 'flight' as const,
                title: flight.flightNumber || flight.flight_number || flight.callsign,
                subtitle: `${flight.departure || flight.origin} → ${flight.arrival || flight.destination}`,
                details: `${flight.status || 'Unknown'} | ${flight.airline || 'No Airline'}`,
                route: findRouteByType('flight'),
                metadata: {
                    flightId: flight.flightId || flight.id,
                    flightNumber: flight.flightNumber || flight.flight_number,
                    departure: flight.departure || flight.origin,
                    arrival: flight.arrival || flight.destination,
                    status: flight.status,
                    airline: flight.airline,
                    aircraft: flight.aircraft || flight.registration,
                    scheduledDeparture: flight.scheduledDeparture || flight.departure_time,
                    actualDeparture: flight.actualDeparture || flight.actual_departure_time,
                    ...flight
                },
                icon: 'plane'
            }));

            return transformedResults;
        } catch (error: any) {
            console.warn('Flight API search failed, using mock data:', error);
            
            // Fall back to mock flight data
            // const mockFlights = mockFlightData.filter((flight: any) => {
            //     const searchableFields = [
            //         flight.flightId,
            //         flight.callSign,
            //         flight.flight_number,
            //         flight.airline,
            //         flight.status,
            //         flight.metadata?.departure,
            //         flight.metadata?.arrival,
            //         flight.metadata?.aircraft
            //     ].filter(Boolean);
                
            //     return searchableFields.some(field => 
            //         field && field.toString().toLowerCase().includes(query.toLowerCase())
            //     );
            // });

            // return transformSearchResult(mockFlights, 'flight');
            return [];
        }
    }
)

const searchSlice = createSlice({
    name: 'search',
    initialState,
    reducers: {
        setQuery: (state, action: PayloadAction<string>) => {
            state.query = action.payload;
        },
        setIsOpen: (state, action: PayloadAction<boolean>) => {
            state.isOpen = action.payload;
        },
        setSelectedResult: (state, action: PayloadAction<SearchResult>) => {
            state.selectedResult = action.payload;
        },
        addRecentSearch: (state, action: PayloadAction<string>) => {
            const query = action.payload.trim();
            if (query && !state.recentSearches.includes(query)) {
                state.recentSearches.unshift(query);
                if (state.recentSearches.length > 10) {
                    state.recentSearches.pop();
                }
            }
        },
        removeRecentSearch: (state, action: PayloadAction<string>) => {
            state.recentSearches = state.recentSearches.filter(
                search => search !== action.payload
            );
        },
        clearRecentSearches: (state) => {
            state.recentSearches = [];
        },
        clearResults: (state) => {
            state.results = [];
            state.error = null;
        }
    },
    extraReducers: (builder) => {
        builder
            .addCase(performSearch.pending, (state) => {
                state.isloading = true;
                state.error = null;
            })
            .addCase(performSearch.fulfilled, (state, action) => {
                state.isloading = false;
                state.results = action.payload;
                state.error = null;
            })
            .addCase(performSearch.rejected, (state, action) => {
                state.isloading = false;
                state.error = action.error.message || 'Search failed';
            })
            .addCase(performApiSearch.pending, (state) => {
                state.isloading = true;
                state.error = null;
            })
            .addCase(performApiSearch.fulfilled, (state, action) => {
                state.isloading = false;
                state.results = action.payload;
                state.error = null;
            })
            .addCase(performApiSearch.rejected, (state, action) => {
                state.isloading = false;
                state.error = action.payload as string || 'Search failed';
            })
            .addCase(searchFlights.pending, (state) => {
                state.isloading = true;
                state.error = null;
            })
            .addCase(searchFlights.fulfilled, (state, action) => {
                state.isloading = false;
                state.results = action.payload;
                state.error = null;
            })
            .addCase(searchFlights.rejected, (state, action) => {
                state.isloading = false;
                state.error = action.payload as string || 'Flight search failed';
            });
    }
});

export const {
    setQuery,
    setIsOpen,
    setSelectedResult,
    addRecentSearch,
    removeRecentSearch,
    clearRecentSearches,
    clearResults
} = searchSlice.actions;

// Selectors
export const selectSearchState = (state: any) => state.search;
export const selectSearchResults = (state: any) => state.search.results;
export const selectSearchQuery = (state: any) => state.search.query;
export const selectIsSearchLoading = (state: any) => state.search.isloading;
export const selectSearchError = (state: any) => state.search.error;
export const selectRecentSearches = (state: any) => state.search.recentSearches;
export const selectIsSearchOpen = (state: any) => state.search.isOpen;
export const selectSelectedSearchResult = (state: any) => state.search.selectedResult;

// Legacy selectors for backward compatibility
export const selectSearchLoading = selectIsSearchLoading;
export const selectSearchIsOpen = selectIsSearchOpen;

export default searchSlice.reducer;
