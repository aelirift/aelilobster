# Step 1: Create the Flask application
flask_app_code = '''
from flask import Flask
import os

app = Flask(__name__)

@app.route('/')
def hello():
    return "Hello from Flask inside Kubernetes Pod!"

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
'''

# Save the Flask app
with open('app.py', 'w') as f:
    f.write(flask_app_code)

print("✅ Flask app created: app.py")