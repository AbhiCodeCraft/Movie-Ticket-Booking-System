import { types } from 'pg';
// Calendar dates are not instants; preserve YYYY-MM-DD in every host timezone.
types.setTypeParser(1082, value => value);
