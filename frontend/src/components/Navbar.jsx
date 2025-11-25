import React, { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useSelector } from 'react-redux'
import "../styles/Navbar.css";
import CartDrawer from "./cart/CartDrawer";

const Navbar = () => {
    const state = useSelector(state => state.handleCart)
    const [isScrolled, setIsScrolled] = useState(false)

    useEffect(() => {
        const handleScroll = () => {
            if (window.scrollY > 20) {
                setIsScrolled(true)
            } else {
                setIsScrolled(false)
            }
        }

        window.addEventListener('scroll', handleScroll)
        return () => window.removeEventListener('scroll', handleScroll)
    }, [])

    return (
        <nav
            className={
                `navbar navbar-expand-lg navbar-light bg-light sticky-top 
                ${isScrolled ? 'navbar-shrink' : ''}`
            }>
            <div className="container">
                <NavLink className="navbar-brand fw-bold fs-4 px-2" to="/">React Ecommerce</NavLink>

                <button className="navbar-toggler mx-2" type="button" data-toggle="collapse"
                    data-target="#navbarSupportedContent" aria-controls="navbarSupportedContent"
                    aria-expanded="false" aria-label="Toggle navigation">
                    <span className="navbar-toggler-icon"></span>
                </button>

                <div className="collapse navbar-collapse" id="navbarSupportedContent">
                    <ul className="navbar-nav m-auto my-2 text-center">
                        <li className="nav-item">
                            <NavLink className="nav-link" to="/">Home</NavLink>
                        </li>
                        <li className="nav-item">
                            <NavLink className="nav-link" to="/product">Products</NavLink>
                        </li>
                        <li className="nav-item">
                            <NavLink className="nav-link" to="/about">About</NavLink>
                        </li>
                        <li className="nav-item">
                            <NavLink className="nav-link" to="/contact">Contact</NavLink>
                        </li>
                    </ul>

                    <div className="buttons text-center">
                        <NavLink to="/login" className="btn btn-outline-dark m-2">
                            <i className="fa fa-sign-in-alt mr-1"></i> Login
                        </NavLink>

                        <NavLink to="/register" className="btn btn-outline-dark m-2">
                            <i className="fa fa-user-plus mr-1"></i> Register
                        </NavLink>

                        {/* Cart now displays count the same way as before */}
                        <NavLink to="/cart" className="btn btn-outline-dark m-2">
                            <i className="fa fa-cart-shopping mr-1"></i> Cart ({state.length})
                        </NavLink>
                    </div>
                </div>
            </div>
        </nav>
    )
}

export default Navbar
