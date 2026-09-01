
var MOM;
(function (MOM) {
    MOM.demoWaveform = [0.03, 0.05, 0.02, 0.08, 0.04, 0.11, 0.07, 0.16, 0.09, 0.04, 0.13, 0.06, 0.02, 0.07, 0.03, 0.12, 0.05, 0.02, 0.09, 0.15, 0.07, 0.04, 0.02, 0.08, 0.05, 0.03, 0.1, 0.18, 0.08, 0.03, 0.06, 0.04, 0.12, 0.07, 0.03, 0.05, 0.09, 0.04, 0.02, 0.07, 0.14, 0.06, 0.03, 0.05, 0.02, 0.1, 0.06, 0.03];
    MOM.demoScenario = {
        profile: { id: 'demo-profile', displayName: 'Demo profile', sessionCount: 14, usableSessionCount: 10, checkInCount: 7 },
        sessions: [
            {
                id: 'demo-1',
                startedAt: '2026-08-28T18:10:00-07:00',
                durationSeconds: 60,
                status: 'Usable',
                learningEligibility: true,
                waveformData: MOM.demoWaveform,
                qualityMetrics: {
                    contactConsistency: 'Good',
                    backgroundNoise: 'Low',
                    motionStability: 'Good',
                    clipping: 'None detected',
                    completion: 'Complete',
                    gainLevel: 'Within range',
                    guidance: 'The sensor remained reasonably steady and the recording was completed.'
                }
            },
            {
                id: 'demo-2',
                startedAt: '2026-08-26T19:32:00-07:00',
                durationSeconds: 60,
                status: 'Needs review',
                learningEligibility: false,
                waveformData: [...MOM.demoWaveform].reverse(),
                qualityMetrics: {
                    contactConsistency: 'Fair',
                    backgroundNoise: 'Elevated',
                    motionStability: 'Limited',
                    clipping: 'None detected',
                    completion: 'Complete',
                    gainLevel: 'Within range',
                    guidance: 'Movement and background noise reduced recording quality.'
                }
            }
        ],
        summary: {
            status: 'insufficient',
            title: 'Not enough information',
            evidenceLevel: 'Growing history',
            supportText: 'Demo data: 10 usable recordings and 7 optional check-ins.',
            explanation: 'MOM chooses not to force a personalized result when available model support is uncertain.'
        },
        device: {
            connectionState: 'demo',
            wiFiState: 'Demo connected',
            firmwareVersion: 'demo-v3',
            lastSync: 'Demo only',
            microphoneGain: 'Demo: within range',
            sampleRate: 8000
        }
    };
    MOM.preferenceIdeas = [
        { id: 'warm-bowl', title: 'Warm bowl or soup', tags: ['Warm', 'Filling'], note: 'A simple warm option that matches saved categories.' },
        { id: 'fresh-wrap', title: 'Fresh wrap or salad', tags: ['Fresh', 'Savory'], note: 'A fresh option that can be adjusted to saved dietary preferences.' },
        { id: 'quick-snack', title: 'Quick snack plate', tags: ['Crunchy', 'Savory'], note: 'A quick option when available time is limited.' },
        { id: 'fruit-yogurt', title: 'Fruit or yogurt-style snack', tags: ['Sweet', 'Fresh'], note: 'A simple sweet/fresh preference match.' },
        { id: 'simple-meal', title: 'Simple filling meal', tags: ['Filling', 'Savory'], note: 'A broader match when the profile favors filling savory choices.' }
    ];
})(MOM || (MOM = {}));


