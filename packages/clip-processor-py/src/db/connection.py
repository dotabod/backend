import os
import logging
from psycopg2 import pool

# Configure logging similar to the old client
log_dir = os.path.join(os.path.dirname(__file__), '..', 'logs')
os.makedirs(log_dir, exist_ok=True)
log_file = os.path.join(log_dir, 'postgresql_client.log')

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

_POOL: pool.SimpleConnectionPool | None = None
_DATABASE_URL = os.environ.get('DATABASE_URL',
        'postgresql://postgres:postgres@localhost:5432/clip_processor')

def get_connection():
    """Return a connection from the pool."""
    global _POOL
    if _POOL is None:
        try:
            _POOL = pool.SimpleConnectionPool(1, 10, _DATABASE_URL)
        except Exception as e:
            logger.error(f"Error creating connection pool: {e}")
            return None
    try:
        return _POOL.getconn()
    except Exception as e:
        logger.error(f"Error getting connection from pool: {e}")
        return None

def return_connection(conn) -> None:
    """Return a connection to the pool."""
    if _POOL and conn:
        _POOL.putconn(conn)

def test_connection() -> bool:
    """Simple connection test."""
    conn = None
    try:
        conn = get_connection()
        if conn:
            cur = conn.cursor()
            cur.execute("SELECT 1")
            cur.close()
            return True
        return False
    except Exception as e:
        logger.error(f"Error connecting to PostgreSQL: {e}")
        return False
    finally:
        if conn:
            return_connection(conn)
