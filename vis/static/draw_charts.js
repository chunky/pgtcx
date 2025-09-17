let chart = null;
let progressChart = null;
let selectedActivityName = null;
let currentView = 'chart';
let currentDate = new Date();
let monthlyData = null;
let dayCharts = {};
let progressData = null;

// Unit conversion functions
function getUnitsSystem() {
    const unitsSelect = document.getElementById('unitsSelect');
    return unitsSelect ? unitsSelect.value : 'metric';
}

function convertSpeed(speedKmh) {
    const units = getUnitsSystem();
    if (units === 'imperial') {
        return speedKmh * 0.621371; // km/h to mph
    }
    return speedKmh;
}

function convertDistance(distanceKm) {
    const units = getUnitsSystem();
    if (units === 'imperial') {
        return distanceKm * 0.621371; // km to miles
    }
    return distanceKm;
}

function getSpeedUnit() {
    const units = getUnitsSystem();
    return units === 'imperial' ? 'mph' : 'km/h';
}

function getDistanceUnit() {
    const units = getUnitsSystem();
    return units === 'imperial' ? 'miles' : 'km';
}

// Load activities when page loads
document.addEventListener('DOMContentLoaded', function() {
    loadActivities();
    
    // Add event listener for smoothing selection
    const smoothingSelect = document.getElementById('smoothingSelect');
    smoothingSelect.addEventListener('change', function() {
        const activitySelect = document.getElementById('activitySelect');
        if (activitySelect.value && selectedActivityName) {
            loadActivityData(activitySelect.value);
        }
    });
    
    // Add event listener for units selection
    const unitsSelect = document.getElementById('unitsSelect');
    unitsSelect.addEventListener('change', function() {
        // Refresh current view with new units
        if (currentView === 'chart' && chart) {
            const activitySelect = document.getElementById('activitySelect');
            if (activitySelect.value && selectedActivityName) {
                loadActivityData(activitySelect.value);
                loadActivityDetails(activitySelect.value);
            }
        } else if (currentView === 'calendar' && monthlyData) {
            createCalendar();
        } else if (currentView === 'progress' && progressData) {
            createProgressChart();
            updateProgressDetails();
        }
    });
});

function switchView(view) {
    currentView = view;
    
    const chartViewBtn = document.getElementById('chartViewBtn');
    const calendarViewBtn = document.getElementById('calendarViewBtn');
    const progressViewBtn = document.getElementById('progressViewBtn');
    const chartContent = document.getElementById('chartContent');
    const calendarContent = document.getElementById('calendarContent');
    const progressContent = document.getElementById('progressContent');
    const activitySelect = document.getElementById('activitySelect');
    const smoothingSelect = document.getElementById('smoothingSelect');
    const calendarControls = document.querySelector('.calendar-controls');

    // Reset all buttons and contents
    chartViewBtn.classList.remove('active');
    calendarViewBtn.classList.remove('active');
    progressViewBtn.classList.remove('active');
    chartContent.style.display = 'none';
    calendarContent.style.display = 'none';
    progressContent.style.display = 'none';

    if (view === 'chart') {
        chartViewBtn.classList.add('active');
        chartContent.style.display = 'flex';
        activitySelect.style.display = 'block';
        smoothingSelect.style.display = 'block';
        calendarControls.style.display = 'none';
    } else if (view === 'calendar') {
        calendarViewBtn.classList.add('active');
        calendarContent.style.display = 'block';
        activitySelect.style.display = 'none';
        smoothingSelect.style.display = 'none';
        calendarControls.style.display = 'flex';
        initializeCalendarControls();
        loadCalendarData();
    } else if (view === 'progress') {
        progressViewBtn.classList.add('active');
        progressContent.style.display = 'flex';
        activitySelect.style.display = 'none';
        smoothingSelect.style.display = 'none';
        calendarControls.style.display = 'none';
        loadProgressData();
    }
}

function changeMonth(delta) {
    currentDate.setMonth(currentDate.getMonth() + delta);
    updateCalendarControls();
    loadCalendarData();
}

function onMonthYearChange() {
    const monthSelect = document.getElementById('monthSelect');
    const yearSelect = document.getElementById('yearSelect');
    
    currentDate.setFullYear(parseInt(yearSelect.value));
    currentDate.setMonth(parseInt(monthSelect.value));
    loadCalendarData();
}

function updateCalendarControls() {
    const monthSelect = document.getElementById('monthSelect');
    const yearSelect = document.getElementById('yearSelect');
    
    // Update month dropdown
    monthSelect.value = currentDate.getMonth().toString();
    
    // Update year dropdown
    yearSelect.value = currentDate.getFullYear().toString();
}

function initializeCalendarControls() {
    const yearSelect = document.getElementById('yearSelect');
    const currentYear = new Date().getFullYear();

    yearSelect.innerHTML = '';
    for (let year = currentYear - 5; year <= currentYear; year++) {
        const option = document.createElement('option');
        option.value = year.toString();
        option.textContent = year.toString();
        yearSelect.appendChild(option);
    }
    
    // Set initial values
    updateCalendarControls();
}

async function loadCalendarData() {
    showLoading(true);
    hideError();

    try {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth() + 1;
        
        const response = await fetch(`/api/monthly_data/${year}/${month}`);
        monthlyData = await response.json();

        if (response.ok) {
            createCalendar();
        } else {
            showError(monthlyData.error || 'Failed to load calendar data');
        }

    } catch (error) {
        showError('Failed to load calendar data: ' + error.message);
    } finally {
        showLoading(false);
    }
}

function createCalendar() {
    const calendarGrid = document.getElementById('calendarGrid');
    calendarGrid.innerHTML = '';

    // Add day headers
    const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    dayHeaders.forEach(day => {
        const header = document.createElement('div');
        header.className = 'calendar-header';
        header.textContent = day;
        calendarGrid.appendChild(header);
    });

    // Get first day of month and number of days
    const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const lastDay = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    // Add empty cells for days before the month starts
    for (let i = 0; i < startingDayOfWeek; i++) {
        const dayCell = document.createElement('div');
        dayCell.className = 'calendar-day other-month';
        calendarGrid.appendChild(dayCell);
    }

    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
        const dayCell = document.createElement('div');
        dayCell.className = 'calendar-day';
        
        const dayNumber = document.createElement('div');
        dayNumber.className = 'day-number';
        dayNumber.textContent = day;
        dayCell.appendChild(dayNumber);

        const chartContainer = document.createElement('div');
        chartContainer.className = 'day-chart';
        
        const dayKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        
        if (monthlyData.activities[dayKey] && monthlyData.activities[dayKey].length > 0) {
            const canvas = document.createElement('canvas');
            canvas.id = `chart-${dayKey}`;
            chartContainer.appendChild(canvas);
            
            // Create small chart for this day
            setTimeout(() => createDayChart(dayKey, monthlyData.activities[dayKey]), 10);
        } else {
            const noData = document.createElement('div');
            noData.className = 'no-data';
            noData.textContent = 'No activity';
            chartContainer.appendChild(noData);
        }

        dayCell.appendChild(chartContainer);
        calendarGrid.appendChild(dayCell);
    }
}

function createDayChart(dayKey, activities) {
    const canvas = document.getElementById(`chart-${dayKey}`);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    
    // Destroy existing chart if it exists
    if (dayCharts[dayKey]) {
        dayCharts[dayKey].destroy();
    }

    // Combine all activities' data for this day with unit conversion
    let allSpeedData = [];
    let allInclineData = [];
    
    activities.forEach(activity => {
        // Sample data points to avoid overcrowding in small charts
        const sampleRate = Math.max(1, Math.floor(activity.speed.length / 50));
        for (let i = 0; i < activity.speed.length; i += sampleRate) {
            allSpeedData.push(convertSpeed(activity.speed[i]));
            allInclineData.push(activity.incline[i]);
        }
    });

    if (allSpeedData.length === 0) return;

    // Create labels
    const labels = allSpeedData.map((_, index) => index);

    // Convert min/max values for scaling
    const convertedMinSpeed = convertSpeed(monthlyData.min_values.speed);
    const convertedMaxSpeed = convertSpeed(monthlyData.max_values.speed);

    dayCharts[dayKey] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    data: allSpeedData,
                    borderColor: '#ff6b6b',
                    backgroundColor: 'rgba(255, 107, 107, 0.1)',
                    borderWidth: 1,
                    fill: false,
                    tension: 0.1,
                    pointRadius: 0,
                },
                {
                    data: allInclineData,
                    borderColor: '#4ecdc4',
                    backgroundColor: 'rgba(78, 205, 196, 0.1)',
                    borderWidth: 1,
                    fill: false,
                    tension: 0.1,
                    pointRadius: 0,
                }
            ]
        },
        options: {
            responsive: false,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    enabled: false
                },
                annotation: {
                    annotations: {
                        speedZeroLine: {
                            type: 'line',
                            scaleID: 'y',
                            value: 0,
                            borderColor: '#ff6b6b',
                            borderWidth: 1,
                            borderDash: [3, 3]
                        },
                        inclineZeroLine: {
                            type: 'line',
                            scaleID: 'y',
                            value: 0,
                            borderColor: '#4ecdc4',
                            borderWidth: 1,
                            borderDash: [5, 2]
                        }
                    }
                }
            },
            scales: {
                x: {
                    display: false
                },
                y: {
                    display: false,
                    min: Math.min(convertedMinSpeed, monthlyData.min_values.incline),
                    max: Math.max(convertedMaxSpeed, monthlyData.max_values.incline)
                }
            },
            elements: {
                line: {
                    borderWidth: 1
                }
            },
            animation: false,
            onClick: function(evt, activeElements) {
                // When clicked, switch to chart view and select the most recent activity from this day
                if (activities.length > 0) {
                    const mostRecentActivity = activities[activities.length - 1]; // Last activity in the array
                    navigateToChartView(mostRecentActivity.tcxid);
                }
            },
            onHover: function(event, elements) {
                event.native.target.style.cursor = 'pointer';
            }
        }
    });

    // Also make the canvas clickable for better UX
    canvas.style.cursor = 'pointer';
    canvas.title = `Click to view detailed chart (${activities.length} activity${activities.length > 1 ? 'ies' : ''})`;
}

function navigateToChartView(tcxid) {
    // Switch to chart view
    switchView('chart');
    
    // Find and select the activity in the dropdown
    const activitySelect = document.getElementById('activitySelect');
    
    // Set the dropdown value
    activitySelect.value = tcxid;
    
    // Find the selected option text for the activity name
    const selectedOption = activitySelect.options[activitySelect.selectedIndex];
    selectedActivityName = selectedOption ? selectedOption.textContent : null;
    
    // Load the activity data and details
    if (tcxid) {
        loadActivityData(tcxid);
        loadActivityDetails(tcxid);
    }
}

async function loadActivities() {
    try {
        const response = await fetch('/api/activities');
        const activities = await response.json();

        console.log('Activities response:', activities);

        if (!response.ok) {
            throw new Error(activities.error || 'Failed to fetch activities');
        }

        if (!Array.isArray(activities)) {
            throw new Error('Expected array of activities, got: ' + typeof activities);
        }

        const select = document.getElementById('activitySelect');
        select.innerHTML = '<option value="">Choose an activity...</option>';

        activities.forEach(activity => {
            const option = document.createElement('option');
            option.value = activity.tcxid;
            option.textContent = activity.display_name;
            select.appendChild(option);
        });

        select.addEventListener('change', function() {
            if (this.value) {
                selectedActivityName = this.options[this.selectedIndex].textContent;
                loadActivityData(this.value);
                loadActivityDetails(this.value);
            } else {
                selectedActivityName = null;
                if (chart) {
                    chart.destroy();
                    chart = null;
                }
                hideActivityDetails();
            }
        });

        // Auto-select the first activity if available (most recent since they're ordered by date DESC)
        if (activities.length > 0) {
            const firstActivity = activities[0];
            select.value = firstActivity.tcxid;
            selectedActivityName = firstActivity.display_name;
            
            // Load the data for the selected activity
            loadActivityData(firstActivity.tcxid);
            loadActivityDetails(firstActivity.tcxid);
        }

    } catch (error) {
        console.error('Error loading activities:', error);
        showError('Failed to load activities: ' + error.message);
    }
}

async function loadActivityData(tcxid) {
    showLoading(true);
    hideError();

    try {
        const smoothingValue = document.getElementById('smoothingSelect').value;
        const response = await fetch(`/api/activity_data/${tcxid}?smoothing=${smoothingValue}`);
        const data = await response.json();

        if (response.ok) {
            createChart(data);
        } else {
            showError(data.error || 'Failed to load activity data');
        }

    } catch (error) {
        showError('Failed to load activity data: ' + error.message);
    } finally {
        showLoading(false);
    }
}

async function loadActivityDetails(tcxid) {
    try {
        console.log('Loading activity details for tcxid:', tcxid);
        const response = await fetch(`/api/activity_details/${tcxid}`);
        const details = await response.json();

        console.log('Activity details response:', response.status, details);

        if (response.ok) {
            displayActivityDetails(details);
        } else {
            console.error('Failed to load activity details:', details.error);
        }

    } catch (error) {
        console.error('Failed to load activity details:', error.message);
    }
}

function toggleDetails() {
    const content = document.getElementById('detailsContent');
    const icon = document.getElementById('toggleIcon');
    
    if (content.style.display === 'none') {
        content.style.display = 'block';
        icon.textContent = '▼';
    } else {
        content.style.display = 'none';
        icon.textContent = '▶';
    }
}

function displayActivityDetails(details) {
    console.log('Displaying activity details:', details);
    const detailsContainer = document.getElementById('activityDetails');
    const detailsTable = document.getElementById('detailsTable');

    detailsTable.innerHTML = '';

    if (Object.keys(details).length === 0) {
        console.log('No details to display');
        detailsContainer.style.display = 'none';
        return;
    }

    const priorityOrder = [
        'Sport', 'Total Time', 'Distance', 'Maximum Speed', 
        'Average Heart Rate', 'Maximum Heart Rate', 'Calories',
        'Start Time', 'Intensity', 'Notes'
    ];

    priorityOrder.forEach(key => {
        if (details[key]) {
            let value = details[key];
            
            // Apply unit conversions to display values
            if (key === 'Distance' && typeof value === 'string' && value.includes('km')) {
                const numValue = parseFloat(value);
                if (!isNaN(numValue)) {
                    value = `${convertDistance(numValue).toFixed(2)} ${getDistanceUnit()}`;
                }
            } else if (key === 'Maximum Speed' && typeof value === 'string' && value.includes('km/h')) {
                const numValue = parseFloat(value);
                if (!isNaN(numValue)) {
                    value = `${convertSpeed(numValue).toFixed(2)} ${getSpeedUnit()}`;
                }
            }
            
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${key}</td>
                <td>${value}</td>
            `;
            detailsTable.appendChild(row);
        }
    });

    Object.entries(details).forEach(([key, value]) => {
        if (!priorityOrder.includes(key)) {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${key}</td>
                <td>${value}</td>
            `;
            detailsTable.appendChild(row);
        }
    });

    detailsContainer.style.display = 'block';
    document.getElementById('detailsContent').style.display = 'block';
    document.getElementById('toggleIcon').textContent = '▼';
    
    console.log('Details container shown');
}

function hideActivityDetails() {
    const detailsContainer = document.getElementById('activityDetails');
    detailsContainer.style.display = 'none';
}

function createChart(data) {
    const ctx = document.getElementById('activityChart').getContext('2d');

    const formattedLabels = data.labels.map(seconds => {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    });

    const heartRateValues = data.heart_rate.filter(value => value !== null && value !== undefined && value > 0);
    const heartRateValuesFromTenth = heartRateValues.slice(9);
    
    let minHeartRate, maxHeartRate;
    if (heartRateValuesFromTenth.length > 0) {
        minHeartRate = Math.min(...heartRateValuesFromTenth);
        maxHeartRate = Math.max(...heartRateValuesFromTenth);
    } else {
        minHeartRate = heartRateValues.length > 0 ? Math.min(...heartRateValues) : 0;
        maxHeartRate = heartRateValues.length > 0 ? Math.max(...heartRateValues) : 0;
    }

    // Convert speed data for display
    const convertedSpeedData = data.speed.map(speed => convertSpeed(speed));

    if (chart) {
        chart.destroy();
    }

    chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: formattedLabels,
            datasets: [
                {
                    label: `Speed (${getSpeedUnit()})`,
                    data: convertedSpeedData,
                    borderColor: '#ff6b6b',
                    backgroundColor: 'rgba(255, 107, 107, 0.1)',
                    borderWidth: 2,
                    fill: false,
                    tension: 0.1,
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    yAxisID: 'y'
                },
                {
                    label: 'Incline (%)',
                    data: data.incline,
                    borderColor: '#4ecdc4',
                    backgroundColor: 'rgba(78, 205, 196, 0.1)',
                    borderWidth: 2,
                    fill: false,
                    tension: 0.1,
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    yAxisID: 'y1'
                },
                {
                    label: 'Heart Rate (bpm)',
                    data: data.heart_rate,
                    borderColor: '#45b7d1',
                    backgroundColor: 'rgba(69, 183, 209, 0.1)',
                    borderWidth: 2,
                    fill: false,
                    tension: 0.1,
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    yAxisID: 'y2'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: selectedActivityName || 'Activity Metrics Over Time',
                    font: {
                        size: 18,
                        weight: 'bold'
                    },
                    padding: 20
                },
                legend: {
                    display: true,
                    position: 'top',
                    align: 'end',
                    labels: {
                        usePointStyle: true,
                        pointStyle: 'line',
                        font: {
                            size: 10
                        },
                        padding: 8,
                        boxWidth: 20,
                        boxHeight: 2
                    }
                },
                annotation: {
                    annotations: {
                        maxHeartRateLine: {
                            type: 'line',
                            scaleID: 'y2',
                            value: maxHeartRate,
                            borderColor: '#45b7d1',
                            borderWidth: 2,
                            borderDash: [5, 5],
                            label: {
                                display: true,
                                content: `Max HR: ${Math.round(maxHeartRate)} bpm`,
                                position: 'start',
                                backgroundColor: '#45b7d1',
                                color: 'white',
                                font: {
                                    size: 12,
                                    weight: 'bold'
                                },
                                padding: 4
                            }
                        },
                        minHeartRateLine: {
                            type: 'line',
                            scaleID: 'y2',
                            value: minHeartRate,
                            borderColor: '#45b7d1',
                            borderWidth: 2,
                            borderDash: [5, 5],
                            label: {
                                display: true,
                                content: `Min HR: ${Math.round(minHeartRate)} bpm`,
                                position: 'start',
                                backgroundColor: '#45b7d1',
                                color: 'white',
                                font: {
                                    size: 12,
                                    weight: 'bold'
                                },
                                padding: 4
                            }
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.datasetIndex === 2) {
                                label += Math.round(context.parsed.y) + ' bpm';
                            } else {
                                label += context.parsed.y.toFixed(2);
                                if (context.datasetIndex === 0) {
                                    label += ' ' + getSpeedUnit();
                                } else if (context.datasetIndex === 1) {
                                    label += '%';
                                }
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: {
                    display: true,
                    title: {
                        display: true,
                        text: 'Time (mm:ss)',
                        font: {
                            weight: 'bold'
                        }
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.1)'
                    }
                },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    min: 0,
                    title: {
                        display: true,
                        text: `Speed (${getSpeedUnit()})`,
                        color: '#ff6b6b',
                        font: {
                            weight: 'bold'
                        }
                    },
                    ticks: {
                        color: '#ff6b6b'
                    },
                    grid: {
                        drawOnChartArea: false,
                    }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: {
                        display: true,
                        text: 'Incline (%)',
                        color: '#4ecdc4',
                        font: {
                            weight: 'bold'
                        }
                    },
                    ticks: {
                        color: '#4ecdc4'
                    },
                    grid: {
                        drawOnChartArea: false,
                    }
                },
                y2: {
                    type: 'linear',
                    display: false,
                    position: 'right'
                }
            },
            interaction: {
                mode: 'index',
                intersect: false,
            }
        },
        plugins: [window['chartjs-plugin-annotation']]
    });
}

function showLoading(show) {
    const loading = document.getElementById('loading');
    loading.style.display = show ? 'block' : 'none';
}

function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

function hideError() {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.style.display = 'none';
}

async function loadProgressData() {
    showLoading(true);
    hideError();

    try {
        const response = await fetch('/api/progress_data');
        progressData = await response.json();

        if (response.ok) {
            createProgressChart();
            updateProgressDetails();
        } else {
            showError(progressData.error || 'Failed to load progress data');
        }

    } catch (error) {
        showError('Failed to load progress data: ' + error.message);
    } finally {
        showLoading(false);
    }
}

function createProgressChart() {
    const ctx = document.getElementById('progressChart').getContext('2d');

    // Destroy existing chart if it exists
    if (progressChart) {
        progressChart.destroy();
    }

    // Filter out zero heart rate values for display
    const filteredHeartRateData = progressData.avg_heartrate.map(hr => hr === 0 ? null : hr);
    const hasValidHeartRate = progressData.avg_heartrate.some(hr => hr > 0);

    // Convert speed data for display
    const convertedSpeedData = progressData.avg_speed.map(speed => convertSpeed(speed));

    const datasets = [
        {
            label: `Average Speed (${getSpeedUnit()})`,
            data: convertedSpeedData,
            borderColor: '#ff6b6b',
            backgroundColor: 'rgba(255, 107, 107, 0.1)',
            borderWidth: 2,
            fill: false,
            tension: 0.1,
            pointRadius: 0,
            pointHoverRadius: 6,
            yAxisID: 'y'
        },
        {
            label: 'Average Incline (%)',
            data: progressData.avg_incline,
            borderColor: '#4ecdc4',
            backgroundColor: 'rgba(78, 205, 196, 0.1)',
            borderWidth: 2,
            fill: false,
            tension: 0.1,
            pointRadius: 0,
            pointHoverRadius: 6,
            yAxisID: 'y1'
        }
    ];

    // Only add heart rate dataset if there are valid heart rate values
    if (hasValidHeartRate) {
        datasets.push({
            label: 'Average Heart Rate (bpm)',
            data: filteredHeartRateData,
            borderColor: '#ffa726',
            backgroundColor: 'rgba(255, 167, 38, 0.1)',
            borderWidth: 2,
            fill: false,
            tension: 0.1,
            pointRadius: 0,
            pointHoverRadius: 6,
            yAxisID: 'y2',
            spanGaps: false
        });
    }

    progressChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: progressData.labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'Training Progress Over Time',
                    font: {
                        size: 20,
                        weight: 'bold'
                    },
                    color: '#2c3e50'
                },
                legend: {
                    display: true,
                    position: 'top'
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            label += context.parsed.y.toFixed(2);
                            if (context.datasetIndex === 0) {
                                label += ' ' + getSpeedUnit();
                            } else if (context.datasetIndex === 1) {
                                label += '%';
                            } else if (context.datasetIndex === 2) {
                                label += ' bpm';
                            }
                            return label;
                        },
                        afterBody: function(context) {
                            const dataIndex = context[0].dataIndex;
                            const info = progressData.activity_info[dataIndex];
                            return [
                                `Activity: ${info.notes || 'No notes'}`,
                                `Sport: ${info.sport}`,
                                `Distance: ${convertDistance(info.distance).toFixed(2)} ${getDistanceUnit()}`,
                                `Duration: ${info.duration} min`
                            ];
                        }
                    }
                }
            },
            scales: {
                x: {
                    display: true,
                    title: {
                        display: true,
                        text: 'Date',
                        font: {
                            weight: 'bold'
                        }
                    },
                    ticks: {
                        maxTicksLimit: 10
                    }
                },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: {
                        display: true,
                        text: `Speed (${getSpeedUnit()})`,
                        color: '#ff6b6b',
                        font: {
                            weight: 'bold'
                        }
                    },
                    ticks: {
                        color: '#ff6b6b'
                    }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: {
                        display: true,
                        text: 'Incline (%)',
                        color: '#4ecdc4',
                        font: {
                            weight: 'bold'
                        }
                    },
                    ticks: {
                        color: '#4ecdc4'
                    },
                    grid: {
                        drawOnChartArea: false,
                    }
                },
                y2: {
                    type: 'linear',
                    display: false,
                    position: 'right'
                }
            },
            interaction: {
                mode: 'index',
                intersect: false,
            },
            onClick: function(evt, activeElements) {
                // Handle click on progress chart
                if (activeElements && activeElements.length > 0) {
                    const dataIndex = activeElements[0].index;
                    const tcxid = progressData.activity_info[dataIndex].tcxid;
                    
                    if (tcxid) {
                        navigateToChartView(tcxid);
                    }
                }
            },
            onHover: function(event, elements) {
                // Change cursor to pointer when hovering over data points
                event.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default';
            }
        }
    });
}

function updateProgressDetails() {
    const progressDetails = document.getElementById('progressDetails');
    const progressDetailsTable = document.getElementById('progressDetailsTable');

    if (!progressData || progressData.labels.length === 0) {
        progressDetails.style.display = 'none';
        return;
    }

    // Calculate summary statistics with unit conversion
    const speeds = progressData.avg_speed.filter(speed => speed > 0);
    const inclines = progressData.avg_incline;
    const heartRates = progressData.avg_heartrate.filter(hr => hr > 0);

    const totalActivities = progressData.labels.length;
    const totalDistance = convertDistance(progressData.activity_info.reduce((sum, info) => sum + info.distance, 0)).toFixed(2);
    const totalDuration = progressData.activity_info.reduce((sum, info) => sum + info.duration, 0).toFixed(1);

    const hrs = Math.floor(totalDuration / 60);
    const mins = totalDuration % 60;
    const details = [
        ['Total Activities', totalActivities],
        ['Total Distance', `${totalDistance} ${getDistanceUnit()}`],
        ['Total Duration', `${hrs} hrs ${mins} min`]
    ];
    progressDetailsTable.innerHTML = '';
    details.forEach(([key, value]) => {
        const row = progressDetailsTable.insertRow();
        const keyCell = row.insertCell();
        const valueCell = row.insertCell();
        keyCell.textContent = key;
        valueCell.textContent = value;
    });

    progressDetails.style.display = 'block';
}

function toggleProgressDetails() {
    const content = document.getElementById('progressDetailsContent');
    const icon = document.getElementById('progressToggleIcon');
    
    if (content.style.display === 'none') {
        content.style.display = 'block';
        icon.textContent = '▼';
    } else {
        content.style.display = 'none';
        icon.textContent = '▶';
    }
}
