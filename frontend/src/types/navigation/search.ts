export interface SearchResultItem {
    title: string;
    details: string;
    route: string;
}

export interface SearchResult {
    id: string;
    type: 'aircraft' | 'flight' | 'maintenance' | 'user' | 'settings';
    title: string;
    subtitle?: string;
    details: string;
    metadata?: Record<string, any>;
    route?: string;
    items?: SearchResultItem[];
    icon?: string;
}

export interface SearchState {
    query: string;
    results: SearchResult[];
    isloading: boolean;
    error: string | null;
    recentSearches: string[];
    isOpen: boolean;
    selectedResult: SearchResult | null;
}


// Mock API responses for different search types
export const mockSearchResponses = {
    aircraft: [
        {
            registration_number: "5Y-KZC",
            icao24: "8962A1",
            aircraft_type_code: "B738",
            manufacturer: "Boeing",
            model: "737-800",
            serial_number: "35789",
            owner: "Kenya Airways",
            operator: "Kenya Airways",
            airline_id: 1 ,
            year_of_manufacture: 2010,
            max_takeoff_weight_kg: 79015,
            seating_capacity: 189,
            engine_type: "CFM56-7B26",
            aircraft_status: "Active",        // e.g., Active, Stored, Scrapped, Maintenance
            adsb_equipped: true,
            mode_s_code: "A4F3C2",            // Transponder Mode S code
            remark: "Used for regional and medium-haul routes"
        },
        {
            registration_number: "5Y-KZD",
            icao24: "8962A2",
            aircraft_type_code: "B738",
            manufacturer: "Boeing",
            model: "737-800",
            serial_number: "35790",
            owner: "Kenya Airways",
            operator: "Kenya Airways",
            airline_id: 1,
            year_of_manufacture: 2011,
            max_takeoff_weight_kg: 79015,
            seating_capacity: 189,
            engine_type: "CFM56-7B26",
            aircraft_status: "Maintenance",    // e.g., Active, Stored, Scrapped, Maintenance
            adsb_equipped: true,
            mode_s_code: "A4F3C3",            // Transponder Mode S code
            remark: "Undergoing scheduled maintenance"
        }
    ],
    
    flight: [
        {
            title: 'KA-001',
            subtitle: 'Lagos to Abuja',
            details: 'Scheduled: 09:00 | Status: On Time',
            flight_number: 'KA-001',
            airline: 'Keshi Aviation',
            status: 'On Time',
            category: 'active', // Routes to flights page
            metadata: {
                departure: 'LOS',
                arrival: 'ABV',
                scheduledDeparture: '09:00',
                aircraft: 'N737BA',
                gate: 'A12'
            },
            icon: 'Plane',
            items: [
                {
                    title: 'Flight Details',
                    details: 'Aircraft: N737BA | Gate: A12',
                    category: 'active'
                },
                {
                    title: 'Flight Plan',
                    details: 'Route: LOS-ABV | Duration: 1h 30m',
                    category: 'plans'
                }
            ]
        },
        {
            title: 'KA-002',
            subtitle: 'Completed Flight',
            details: 'Completed: 2025-07-17 | Duration: 1h 45m',
            flight_number: 'KA-002',
            airline: 'Keshi Aviation',
            status: 'Completed',
            category: 'completed', // Routes to completed flights
            metadata: {
                departure: 'ABV',
                arrival: 'PHC',
                completedAt: '2025-07-17',
                aircraft: 'A320KA'
            },
            icon: 'Plane'
        }
    ],
    
    maintenance: [
        {
            title: 'Engine Inspection - N737BA',
            subtitle: 'A-Check Required',
            details: 'Due: 2025-07-20 | Estimated: 8 hours',
            aircraft_registration: 'N737BA',
            maintenance_type: 'A-Check',
            status: 'Scheduled',
            metadata: {
                dueDate: '2025-07-20',
                estimatedHours: 8,
                technician: 'John Doe',
                priority: 'Medium'
            },
            icon: 'Wrench'
        }
    ],
    
    user: [
        {
            title: 'John Doe',
            subtitle: 'Captain',
            details: 'License: ATP | Total Hours: 5000',
            name: 'John Doe',
            role: 'Captain',
            status: 'Active',
            category: 'roster', // Routes to crew roster
            metadata: {
                licenseType: 'ATP',
                totalHours: 5000,
                department: 'Flight Operations',
                lastFlight: 'KA-001'
            },
            icon: 'User',
            items: [
                {
                    title: 'View Profile',
                    details: 'Complete profile and certifications',
                    category: 'roster'
                },
                {
                    title: 'Schedule',
                    details: 'Upcoming flight assignments',
                    category: 'scheduling'
                }
            ]
        }
    ],
    
    settings: [
        {
            title: 'Flight Rules Configuration',
            subtitle: 'Operational Settings',
            details: 'Last updated: 2025-07-15 by Admin',
            category: '5',
            status: 'Active',
            metadata: {
                lastModified: '2025-07-15',
                modifiedBy: 'Admin',
                version: '1.2.3'
            },
            icon: 'Settings'
        }
    ]
};