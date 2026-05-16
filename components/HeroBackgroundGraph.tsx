import React from 'react';

const HeroBackgroundGraph: React.FC = () => {
    return (
        <div className="w-full h-full relative">
            <img 
                src="https://storage.googleapis.com/zcene/Zcene%20hero%20background.png" 
                alt="" 
                className="w-full h-full object-cover"
                loading="eager"
            />
        </div>
    );
};

export default HeroBackgroundGraph;