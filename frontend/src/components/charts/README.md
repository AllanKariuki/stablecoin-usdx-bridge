# Crew Reports Charts Component

This directory contains the comprehensive charts and data visualization components for the Crew Reports module, replacing the Superset dashboard integration.

## 📁 Structure

```
src/
├── components/
│   └── charts/
│       ├── CrewChartsComponent.tsx    # Main charts component
│       └── index.ts                    # Exports
└── data/
    └── mockCrewChartsData.ts          # Mock data for all charts
```

## 📊 Charts Included

The `CrewChartsComponent` includes **10 comprehensive visualizations**:

### 1. **Crew Distribution by Position** (Pie Chart)
- Shows the breakdown of crew members by their positions
- Categories: Captain, First Officer, Flight Engineer, Flight Attendant, Purser

### 2. **Certification Status** (Pie Chart)
- Displays certification status across all crew
- Status: Active, Expiring Soon, Expired, In Renewal

### 3. **Monthly Flight Hours Trend** (Stacked Area Chart)
- 6-month trend of flight hours by position
- Tracks: Captains, First Officers, Flight Attendants

### 4. **Top 10 Crew Utilization Rate** (Horizontal Bar Chart)
- Shows top performing crew members by utilization percentage
- Helps identify high-performing crew members

### 5. **Crew by Base Location** (Grouped Bar Chart)
- Comparison of total crew vs. active crew per location
- Locations: JFK, LAX, ORD, DFW, ATL, MIA, SFO

### 6. **Training Progress** (Line Chart)
- 8-week training progress tracking
- Tracks: Completed, In Progress, Scheduled

### 7. **License Expiry Timeline** (Bar Chart)
- 12-month forecast of license expirations
- Helps with proactive license renewal planning

### 8. **Daily Crew Availability** (Area Chart)
- 7-day availability forecast
- Shows: Available, Scheduled, On Leave

### 9. **Average Flight Hours by Position** (Bar Chart)
- Monthly average compared to maximum allowed hours
- Visual indicator of workload distribution

### 10. **Crew Status Distribution** (Bar Chart)
- Overall crew status breakdown
- Status: Active, On Leave, Training, Inactive

## 🚀 Usage

### Basic Usage

```tsx
import CrewChartsComponent from '../../components/charts/CrewChartsComponent';

function CrewReports() {
  return (
    <div>
      <CrewChartsComponent />
    </div>
  );
}
```

### With Custom Styling

```tsx
import CrewChartsComponent from '../../components/charts/CrewChartsComponent';

function CrewReports() {
  return (
    <div>
      <CrewChartsComponent className="custom-class border-2" />
    </div>
  );
}
```

## 🎨 Customization

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `className` | `string` | `''` | Additional CSS classes for styling |

### Modifying Charts

To customize individual charts, edit `src/components/charts/CrewChartsComponent.tsx`:

```tsx
// Example: Change chart colors
<Bar dataKey="utilizationRate" fill="#10b981" name="Utilization %" />

// Example: Adjust chart height
<ResponsiveContainer width="100%" height={400}>
```

### Updating Mock Data

Edit `src/data/mockCrewChartsData.ts` to update chart data:

```tsx
export const crewDistributionData: CrewDistributionData[] = [
  { position: 'Captain', count: 62, fill: '#2563eb' },
  // Add more data...
];
```

## 📦 Dependencies

- **recharts**: ^2.x - Main charting library
- **lucide-react**: Icons used in the parent component
- **tailwindcss**: Styling framework

## 🎨 Color Palette

The charts use a consistent color scheme:

- **Blue shades**: Primary data (Captains, main metrics)
  - `#2563eb`, `#3b82f6`, `#60a5fa`, `#93c5fd`, `#1e40af`
- **Green**: Positive metrics (Active, Completed, Available)
  - `#10b981`
- **Orange**: Warning states (Expiring Soon, In Progress)
  - `#f59e0b`
- **Red**: Critical states (Expired, Critical)
  - `#ef4444`
- **Purple**: Secondary metrics
  - `#6366f1`
- **Gray**: Inactive/Neutral
  - `#9ca3af`, `#e5e7eb`

## 🔄 Real Data Integration

To replace mock data with real API data:

1. **Create API service** in `src/services/crewChartsService.ts`:

```tsx
export async function fetchCrewDistribution() {
  const response = await get('/api/crew/distribution');
  return response.data;
}
```

2. **Use in component with hooks**:

```tsx
const [chartData, setChartData] = useState(crewDistributionData);

useEffect(() => {
  fetchCrewDistribution().then(setChartData);
}, []);
```

3. **Or connect to Redux**:
```tsx
const dispatch = useDispatch();
const chartData = useSelector(selectCrewChartData);

useEffect(() => {
  dispatch(fetchCrewChartData());
}, [dispatch]);
```

## 📊 Data Types

All chart data types are exported from `mockCrewChartsData.ts`:

- `CrewDistributionData`
- `FlightHoursTrendData`
- `CrewUtilizationData`
- `CertificationStatusData`
- `BaseLocationData`
- `TrainingProgressData`
- `LicenseExpiryData`

## 🎯 Features

- ✅ **Responsive Design**: All charts adapt to container width
- ✅ **Interactive Tooltips**: Hover over data points for details
- ✅ **Legends**: Clear labeling for all data series
- ✅ **Custom Styling**: Tailwind CSS integration
- ✅ **TypeScript**: Full type safety
- ✅ **Performance**: Optimized rendering with ResponsiveContainer

## 🐛 Troubleshooting

### Charts not rendering?
- Ensure `recharts` is installed: `npm install recharts`
- Check console for errors
- Verify data structure matches interfaces

### Styling issues?
- Ensure Tailwind CSS is properly configured
- Check that parent containers have defined heights

### TypeScript errors?
- Verify all data matches the exported interfaces
- Check that index signatures are present in custom types

## 📝 Notes

- Charts are optimized for desktop and tablet viewing
- Mobile responsiveness uses grid breakpoints (md:, lg:)
- All mock data represents realistic aviation crew metrics
- Data refreshes can be handled by parent component

## 🔮 Future Enhancements

Potential additions:
- [ ] Export individual charts as images/PDF
- [ ] Date range filtering
- [ ] Real-time data updates via WebSocket
- [ ] Drill-down capabilities
- [ ] Comparison mode (year-over-year)
- [ ] Custom color theme selector
