"""Private JSON-lines bridge. Only Node's backend can access this process."""
import json
import ssl
import sys
from decimal import Decimal
from pathlib import Path

connection = None

def encode(value):
    if isinstance(value, Decimal):
        return float(value)
    return str(value)

for line in sys.stdin:
    request = {}
    try:
        request = json.loads(line)
        if request['op'] == 'connect':
            import pyexasol
            config = request['config']
            options = dict(dsn=config['dsn'], user=config['user'], password=Path(config['passwordFile']).read_text().strip(), fetch_dict=True, connection_timeout=15, socket_timeout=60)
            if config.get('allowSelfSigned'):
                options['websocket_sslopt'] = {'cert_reqs': ssl.CERT_NONE}
            connection = pyexasol.connect(**options)
            result = connection.execute('SELECT CURRENT_TIMESTAMP AS CONNECTED_AT').fetchall()
        elif request['op'] == 'query':
            if connection is None:
                raise RuntimeError('Not connected')
            # Parameters are formatted by the official driver, never interpolated by the browser.
            statement = connection.execute(request['sql'], request.get('params', {}))
            result = statement.fetchall() if request.get('rows', True) else []
        elif request['op'] == 'insert':
            statement = connection.create_prepared_statement(request['sql'])
            statement.execute_prepared(request['values'])
            result = {'inserted': len(request['values'])}
            statement.close()
        else:
            raise ValueError('Unknown operation')
        print(json.dumps({'id': request['id'], 'ok': True, 'result': result}, default=encode), flush=True)
    except Exception as error:
        # Driver exceptions may include passwords, SQL literals and borrower payloads.
        message = 'Exasol request failed (' + type(error).__name__ + '). Verify driver, credentials, schema and database availability.'
        print(json.dumps({'id': request.get('id'), 'ok': False, 'error': message}), flush=True)
