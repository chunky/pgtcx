from flask import Flask, render_template, request, jsonify
import psycopg2
import psycopg2.extras
from datetime import datetime
import os

app = Flask(__name__)

# Database configuration
DB_CONFIG = {
    'host': 'localhost',
    'database': 'pgtcx',
    'user': 'pgtcx',
    'password': 'pgtcx',
    'port': '5432'
}

def get_db_connection():
    """Create and return a database connection"""
    return psycopg2.connect(**DB_CONFIG)

@app.route('/')
def index():
    """Main page with activity selector and chart"""
    return render_template('index.html')

@app.route('/api/activities')
def get_activities():
    """Get list of all activities for dropdown"""
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        query = """
        SELECT tcxid, activityid, sport, notes, lapstarttime
        FROM activity
        ORDER BY lapstarttime DESC
        """

        cur.execute(query)
        activities = cur.fetchall()

        print(f"Found {len(activities)} activities")  # Debug output

        # Format the activities for the dropdown
        formatted_activities = []
        for activity in activities:
            # Format the display name
            start_time = activity['lapstarttime']
            if start_time:
                try:
                    # Parse and format the timestamp
                    dt = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
                    formatted_time = dt.strftime('%Y-%m-%d %H:%M')
                except:
                    formatted_time = str(start_time)[:16]
            else:
                formatted_time = 'Unknown Date'

            sport = activity['sport'] or 'Unknown Sport'
            notes = activity['notes'] or ''

            display_name = f"{formatted_time} - {notes} ({sport})"

            formatted_activities.append({
                'tcxid': activity['tcxid'],
                'display_name': display_name
            })

        cur.close()
        conn.close()

        return jsonify(formatted_activities)

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/activity_data/<int:tcxid>')
def get_activity_data(tcxid):
    """Get speed, incline, and heart rate data for a specific activity"""
    try:
        # Get smoothing parameter from query string, default to 1 (no smoothing)
        smoothing = int(request.args.get('smoothing', 1))
        
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        query = """
        SELECT
            time,
            speed_kph,
            gradient,
            avg_heartrate_bpm
        FROM speeds_dists
        WHERE tcxid = %s
        AND speed_kph IS NOT NULL
        AND speed_kph > 0
        ORDER BY time
        """

        cur.execute(query, (tcxid,))
        data = cur.fetchall()

        if not data:
            return jsonify({'error': 'No data found for this activity'}), 404

        # Format data for Chart.js
        formatted_data = {
            'labels': [],
            'speed': [],
            'incline': [],
            'heart_rate': []
        }

        start_time = data[0]['time']

        for row in data:
            # Calculate elapsed time in seconds
            elapsed_seconds = (row['time'] - start_time).total_seconds()

            formatted_data['labels'].append(int(elapsed_seconds))
            formatted_data['speed'].append(row['speed_kph'])
            formatted_data['incline'].append(row['gradient'] or 0)
            formatted_data['heart_rate'].append(row['avg_heartrate_bpm'] or 0)

        # Apply smoothing if requested
        if smoothing > 1:
            formatted_data['speed'] = apply_moving_average(formatted_data['speed'], smoothing)
            formatted_data['incline'] = apply_moving_average(formatted_data['incline'], smoothing)
            formatted_data['heart_rate'] = apply_moving_average(formatted_data['heart_rate'], smoothing)

        cur.close()
        conn.close()

        return jsonify(formatted_data)

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/activity_details/<int:tcxid>')
def get_activity_details(tcxid):
    """Get detailed information for a specific activity"""
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        query = """
        SELECT 
            sport,
            notes,
            lapstarttime,
            totaltimeseconds,
            distancemeters,
            maximumspeed,
            calories,
            averageheartratebpm,
            maximumheartratebpm,
            intensity
        FROM activity
        WHERE tcxid = %s
        """

        cur.execute(query, (tcxid,))
        activity = cur.fetchone()

        if not activity:
            return jsonify({'error': 'Activity not found'}), 404

        # Format the activity details, filtering out null and zero values
        details = {}
        
        if activity['sport']:
            details['Sport'] = activity['sport']
            
        if activity['notes']:
            details['Notes'] = activity['notes']
            
        if activity['lapstarttime']:
            try:
                dt = datetime.fromisoformat(activity['lapstarttime'].replace('Z', '+00:00'))
                details['Start Time'] = dt.strftime('%Y-%m-%d %H:%M:%S')
            except:
                details['Start Time'] = str(activity['lapstarttime'])
        
        if activity['totaltimeseconds'] and activity['totaltimeseconds'] > 0:
            # Convert seconds to hours:minutes:seconds format
            total_seconds = int(activity['totaltimeseconds'])
            hours = total_seconds // 3600
            minutes = (total_seconds % 3600) // 60
            seconds = total_seconds % 60
            if hours > 0:
                details['Total Time'] = f"{hours:02d}:{minutes:02d}:{seconds:02d}"
            else:
                details['Total Time'] = f"{minutes:02d}:{seconds:02d}"
        
        if activity['distancemeters'] and activity['distancemeters'] > 0:
            # Convert meters to kilometers
            distance_km = activity['distancemeters'] / 1000
            details['Distance'] = f"{distance_km:.2f} km"
        
        if activity['maximumspeed'] and activity['maximumspeed'] > 0:
            # Convert m/s to km/h
            max_speed_kph = activity['maximumspeed'] * 3.6
            details['Maximum Speed'] = f"{max_speed_kph:.2f} km/h"
        
        if activity['calories'] and activity['calories'] > 0:
            details['Calories'] = f"{int(activity['calories'])}"
        
        if activity['averageheartratebpm'] and activity['averageheartratebpm'] > 0:
            details['Average Heart Rate'] = f"{int(activity['averageheartratebpm'])} bpm"
        
        if activity['maximumheartratebpm'] and activity['maximumheartratebpm'] > 0:
            details['Maximum Heart Rate'] = f"{int(activity['maximumheartratebpm'])} bpm"
        
        if activity['intensity']:
            details['Intensity'] = activity['intensity']

        cur.close()
        conn.close()

        return jsonify(details)

    except Exception as e:
        return jsonify({'error': str(e)}), 500

def apply_moving_average(data, window_size):
    """Apply moving average smoothing to a list of numbers"""
    if window_size <= 1 or len(data) < window_size:
        return data
    
    smoothed = []
    for i in range(len(data)):
        # Calculate the window bounds
        start = max(0, i - window_size // 2)
        end = min(len(data), start + window_size)
        
        # Adjust start if we're near the end
        if end - start < window_size:
            start = max(0, end - window_size)
        
        # Calculate average of values in the window
        window_values = data[start:end]
        # Filter out None values and zeros for heart rate
        valid_values = [v for v in window_values if v is not None and v != 0]
        
        if valid_values:
            smoothed.append(sum(valid_values) / len(valid_values))
        else:
            smoothed.append(0)
    
    return smoothed

@app.route('/api/monthly_data/<int:year>/<int:month>')
def get_monthly_data(year, month):
    """Get speed and incline data for all activities in a specific month"""
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        # First, get all activities for the month
        query = """
        SELECT tcxid, lapstarttime, notes
        FROM activity
        WHERE EXTRACT(YEAR FROM lapstarttime) = %s
        AND EXTRACT(MONTH FROM lapstarttime) = %s
        ORDER BY lapstarttime
        """

        cur.execute(query, (year, month))
        activities = cur.fetchall()

        if not activities:
            return jsonify({'activities': {}, 'min_values': {}, 'max_values': {}})

        monthly_data = {'activities': {}, 'min_values': {}, 'max_values': {}}
        all_speed_values = []
        all_incline_values = []

        for activity in activities:
            tcxid = activity['tcxid']
            activity_date = activity['lapstarttime'].date()
            day_key = activity_date.strftime('%Y-%m-%d')

            # Get speed and incline data for this activity
            data_query = """
            SELECT speed_kph, gradient
            FROM speeds_dists
            WHERE tcxid = %s
            AND speed_kph IS NOT NULL
            AND speed_kph > 0
            ORDER BY time
            """

            cur.execute(data_query, (tcxid,))
            data = cur.fetchall()

            if data:
                speeds = [row['speed_kph'] for row in data if row['speed_kph'] is not None]
                inclines = [row['gradient'] or 0 for row in data]

                # Store data for this day
                if day_key not in monthly_data['activities']:
                    monthly_data['activities'][day_key] = []

                monthly_data['activities'][day_key].append({
                    'tcxid': tcxid,
                    'notes': activity['notes'] or '',
                    'speed': speeds,
                    'incline': inclines
                })

                # Collect all values for min/max calculation
                all_speed_values.extend(speeds)
                all_incline_values.extend(inclines)

        # Calculate global min/max for consistent scaling
        if all_speed_values:
            monthly_data['min_values'] = {
                'speed': min(all_speed_values),
                'incline': min(all_incline_values) if all_incline_values else 0
            }
            monthly_data['max_values'] = {
                'speed': max(all_speed_values),
                'incline': max(all_incline_values) if all_incline_values else 0
            }
        else:
            monthly_data['min_values'] = {'speed': 0, 'incline': 0}
            monthly_data['max_values'] = {'speed': 10, 'incline': 10}

        cur.close()
        conn.close()

        return jsonify(monthly_data)

    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)
