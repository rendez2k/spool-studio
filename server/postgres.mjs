import {eraseSavedData} from './erase-data.mjs';
export function postgresDatabase(client) {
  return {
    async eraseSavedData(input) {
      const connection = await client.connect();
      try {return await eraseSavedData(connection, input);} finally {connection.release();}
    },
    prepare(statement) {
      if (!/^(SELECT|INSERT INTO|UPDATE) /.test(statement) || !/\b(libraries|phone_batches)\b/.test(statement)) throw Error("Unsupported inventory query.");
      let position = 0;
      const query = statement.replaceAll("?", () => "$" + ++position);
      return {
        bind(...values) {
          if (values.length !== position) throw Error("Incorrect query parameters.");
          return {
            async first() { return (await client.query(query, values)).rows[0] ?? null; },
            async run() { return { meta: { changes: (await client.query(query, values)).rowCount } }; },
          };
        },
      };
    },
  };
}
