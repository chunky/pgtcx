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
        ORDER BY CAST(lapstarttime AS TEXT) DESC
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

            display_name = f"{formatted_time} - {sport}"
            if notes:
                display_name += f" ({notes[:30]}...)" if len(notes) > 30 else f" ({notes})"

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
            # Calculate elapsed time in minutes
            elapsed_seconds = (row['time'] - start_time).total_seconds()
            elapsed_minutes = elapsed_seconds / 60

            formatted_data['labels'].append(round(elapsed_minutes, 2))
            formatted_data['speed'].append(row['speed_kph'])
            formatted_data['incline'].append(row['gradient'] or 0)
            formatted_data['heart_rate'].append(row['avg_heartrate_bpm'] or 0)

        cur.close()
        conn.close()

        return jsonify(formatted_data)

    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)
