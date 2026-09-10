import {eraseSavedData} from './erase-data.mjs';
import {communityRollsQuery} from './community-stats.mjs';
export function postgresDatabase(client) {
  return {
    async communityRollCount() {
      const result = await client.query(communityRollsQuery);
      const value = result.rows[0]?.rolls;
      if (typeof value !== 'string' || !/^\d+$/.test(value)) throw Error('Invalid community count.');
      return Number(value);
    },
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
