import os
import logging
from functools import wraps
from flask import Flask, request, jsonify

# Configure logging
log_dir = os.path.join(os.path.dirname(__file__), 'logs')
os.makedirs(log_dir, exist_ok=True)
log_file = os.path.join(log_dir, 'api_server.log')
logging.basicConfig(
    force=True,
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(log_file, mode='a')
    ]
)
logger = logging.getLogger(__name__)
logger.info("=== API Server logging initialized ===")

# Define the API key for authentication
API_KEY = os.environ.get('VISION_API_KEY')
if not API_KEY and os.environ.get('RUN_LOCALLY') != 'true':
    logger.error("No API key found. Set VISION_API_KEY environment variable.")
    raise ValueError("VISION_API_KEY environment variable must be set")


def require_api_key(f):
    """Flask decorator enforcing presence of X-API-Key header."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if os.environ.get('RUN_LOCALLY') == 'true':
            return f(*args, **kwargs)

        provided_key = request.headers.get('X-API-Key')
        if provided_key and provided_key == API_KEY:
            return f(*args, **kwargs)
        logger.warning(
            "Unauthorized access attempt: %s - %s",
            request.remote_addr,
            request.path,
        )
        return jsonify({'error': 'Unauthorized. Valid API key required.'}), 401

    return decorated_function

# Import routes after defining require_api_key to avoid circular imports
from . import routes


def create_app():
    """Create and configure the Flask application."""
    app = Flask(__name__)

    from ..api_server import initialize_app, app_initialized

    @app.before_request
    def ensure_initialized():
        if not app_initialized:
            logger.info("Initializing app before first request...")
            initialize_app()

    app.register_blueprint(routes.bp)
    return app
