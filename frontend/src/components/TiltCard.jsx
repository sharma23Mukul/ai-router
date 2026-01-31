import React, { useRef, useState } from 'react';

const TiltCard = ({ children, className = "" }) => {
    const cardRef = useRef(null);
    const [rotation, setRotation] = useState({ x: 0, y: 0 });
    const [scale, setScale] = useState(1);
    const [glarePosition, setGlarePosition] = useState({ x: 50, y: 50, opacity: 0 });

    const handleMouseMove = (e) => {
        if (!cardRef.current) return;

        const rect = cardRef.current.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;

        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Calculate rotation (max 5 degrees - subtle premium feel)
        const rotateY = ((mouseX / width) - 0.5) * 10; // -5 to 5
        const rotateX = ((mouseY / height) - 0.5) * -10; // 5 to -5 (inverse)

        setRotation({ x: rotateX, y: rotateY });

        // Glare effect
        setGlarePosition({
            x: (mouseX / width) * 100,
            y: (mouseY / height) * 100,
            opacity: 1
        });
    };

    const handleMouseEnter = () => {
        setScale(1.02);
    };

    const handleMouseLeave = () => {
        setRotation({ x: 0, y: 0 });
        setScale(1);
        setGlarePosition(prev => ({ ...prev, opacity: 0 }));
    };

    return (
        <div
            className={`perspective-1000 ${className}`}
            style={{ perspective: '1000px' }}
        >
            <div
                ref={cardRef}
                onMouseMove={handleMouseMove}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                className="transition-transform duration-100 ease-out transform-gpu relative overflow-hidden"
                style={{
                    transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg) scale(${scale})`,
                    transformStyle: 'preserve-3d',
                }}
            >
                {children}

                {/* Glare overlay */}
                <div
                    className="absolute inset-0 pointer-events-none z-50 mix-blend-overlay transition-opacity duration-300"
                    style={{
                        background: `radial-gradient(circle at ${glarePosition.x}% ${glarePosition.y}%, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0) 60%)`, // White sheen
                        opacity: glarePosition.opacity
                    }}
                />
            </div>
        </div>
    );
};

export default TiltCard;
