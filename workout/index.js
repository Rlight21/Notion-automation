const { Client } = require('@notionhq/client');

const config = {
    notion_key: 'ntn_I88599578723ia5SQMHkntDZFBPCi036snYoAjpOo7y51l',
    databases: {
        workoutSessions: 'ffdbdac4-8a61-4bda-848d-cd4871be05c7',
        exerciseLogs: '7f0a6fec-e828-49ee-987e-e9122bf8300e',
        exercises: '06f78122399a4d5bb6b0810fd34a254b',
	programs: '60a5ed656c8a4247a0a6a3a3572a2194?'
    }
};

const notion = new Client({ auth: config.notion_key });

async function checkExistingLogs(sessionId) {
    try {
        const response = await notion.databases.query({
            database_id: config.databases.exerciseLogs,
            filter: {
                property: 'Workout Log',
                relation: {
                    contains: sessionId
                }
            }
        });
        return response.results.length > 0;
    } catch (error) {
        console.error('Error checking existing logs:', error);
        return false;
    }
}

async function getExerciseDetails(exerciseId) {
    try {
        const exercise = await notion.pages.retrieve({
            page_id: exerciseId
        });
        return {
            sets: exercise.properties['max #sets']?.formula?.number || 12,
            reps: exercise.properties['max #reps']?.formula?.number || 99,
            weight: exercise.properties['Best Weight']?.formula?.number || 99
        };
    } catch (error) {
        console.error('Error getting exercise details:', error);
	console.error('Exercise data:', exercise?.properties);  // Added for debugging
        return { sets: 12, reps: 99, weight: 99 };
    }
}

async function getExercisesForProgram(programId) {
    try {
        console.log('Getting exercises for program:', programId);
        const response = await notion.databases.query({
            database_id: config.databases.exercises,
            filter: {
                property: 'Program',
                relation: {
                    contains: programId
                }
            }
        });
        console.log('Found exercises:', response.results.length);
        return response.results;
    } catch (error) {
        console.error('Error getting exercises:', error);
        return [];
    }
}

async function createExerciseLogs(sessionId, programId) {
    try {
        const hasExistingLogs = await checkExistingLogs(sessionId);
        if (hasExistingLogs) {
            console.log(`Exercise logs already exist for session ${sessionId}, skipping...`);
            return;
        }

        console.log('Creating exercise logs for session:', sessionId);
        console.log('Program:', programId);

        const exercises = await getExercisesForProgram(programId);
        console.log(`Found ${exercises.length} exercises in program`);

        for (const exercise of exercises) {
            console.log('Creating log for exercise:', exercise.id);
            
            // Get exercise details
            const details = await getExerciseDetails(exercise.id);
            console.log('Exercise details:', details);

            await notion.pages.create({
                parent: { database_id: config.databases.exerciseLogs },
                properties: {
                    'Exercise': {
                        relation: [{ id: exercise.id }]
                    },
                    'Workout Log': {
                        relation: [{ id: sessionId }]
                    },
                    'Sets': {
                        number: details.sets
                    },
                    'Reps': {
                        number: details.reps
                    },
                    'Weight': {
                        number: details.weight
                    }
                }
            });
        }
        console.log(`Created ${exercises.length} exercise logs`);
    } catch (error) {
        console.error('Error creating exercise logs:', error);
    }
}

async function checkNewSessions() {
    try {
        const now = new Date();
        const fiveMinutesAgo = new Date(now.getTime() - 5 * 60000);
        
        console.log('\nChecking for sessions created after:', fiveMinutesAgo.toISOString());

        const response = await notion.databases.query({
            database_id: config.databases.workoutSessions,
            filter: {
                and: [
                    {
                        timestamp: 'created_time',
                        created_time: {
                            after: fiveMinutesAgo.toISOString()
                        }
                    }
                ]
            }
        });

        console.log('Found sessions:', response.results.length);

        for (const session of response.results) {
            const programRelation = session.properties.Program.relation;
            if (programRelation && programRelation.length > 0) {
                const programId = programRelation[0].id;
                console.log(`Found session ${session.id} with program ${programId}`);
                await createExerciseLogs(session.id, programId);
            }
        }
    } catch (error) {
        console.error('Error checking for new sessions:', error);
    }
}

console.log('Watching for new workout sessions...');
setInterval(checkNewSessions, 30000); // Check every 30 seconds
checkNewSessions(); // Check immediately on startup